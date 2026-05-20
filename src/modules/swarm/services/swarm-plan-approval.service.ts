import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import type { TraceEventType } from '../../trace/types/trace.types';
import type { SwarmIntegrationMode, SwarmPlan } from '../types';
import { SwarmBridgeRuntimeService } from './swarm-bridge-runtime.service';
import { SwarmRunStoreService } from './swarm-run-store.service';

type ApprovalChoice = 'approve' | 'reject' | 'modify';

type SmartInputLike = {
  question?: (message: string) => Promise<string>;
  askChoice?: (
    message: string,
    choices: Array<{ key: string; label: string; description?: string }>,
  ) => Promise<string>;
};

@Injectable()
export class SwarmPlanApprovalService {
  constructor(
    private readonly store: SwarmRunStoreService,
    private readonly bridgeRuntime: SwarmBridgeRuntimeService,
    private readonly traceWriter: TraceWriterService,
    private readonly traceContext: TraceContextService,
  ) {}

  formatPlanYaml(plan: SwarmPlan): string {
    const lines = [
      `integrationMode: ${plan.integrationMode}`,
      `runtimePolicy: ${this.bridgeRuntime.formatPolicyLabel(plan.runtimePolicy)}`,
      `maxWorkers: ${plan.globalConstraints.maxWorkers}`,
      `reason: ${plan.reasonForSwarm}`,
      '',
      'tasks:',
    ];

    for (const task of plan.tasks) {
      lines.push(`  - id: ${task.id}`);
      lines.push(`    worker: ${task.worker.name} (${task.worker.kind})`);
      lines.push(`    owns:`);
      for (const ownership of task.fileOwnership) {
        lines.push(`      - ${ownership.glob}`);
      }
      if (task.injectedSkills.length > 0) {
        lines.push(`    injectedSkills: [${task.injectedSkills.join(', ')}]`);
      }
      if (task.discoverableSkills.length > 0) {
        lines.push(`    discoverableSkills: [${task.discoverableSkills.join(', ')}]`);
      }
      lines.push(`    allowedTools: [${task.allowedTools.join(', ')}]`);
      if (task.focusedVerification.length > 0) {
        lines.push(`    focusedVerification:`);
        for (const step of task.focusedVerification) {
          lines.push(`      - ${step.command}`);
        }
      }
      lines.push('');
    }

    if (plan.finalVerification.length > 0) {
      lines.push('finalVerification:');
      for (const step of plan.finalVerification) {
        lines.push(`  - ${step.command}`);
      }
    }

    return lines.join('\n');
  }

  async requestApproval(plan: SwarmPlan, smartInput?: SmartInputLike): Promise<{ plan: SwarmPlan; approved: boolean }> {
    if (!smartInput?.askChoice) {
      return { plan, approved: false };
    }

    const choice = await smartInput.askChoice('Approve this Swarm Plan?', [
      { key: 'approve', label: 'Approve and prepare run', description: `Integration: ${plan.integrationMode}` },
      { key: 'reject', label: 'Reject plan' },
      { key: 'modify', label: 'Keep as draft for edits' },
    ]);

    if (choice === 'reject') {
      const rejected: SwarmPlan = { ...plan, status: 'rejected' };
      await this.store.savePlan(rejected);
      return { plan: rejected, approved: false };
    }

    if (choice === 'modify') {
      return { plan, approved: false };
    }

    let integrationMode = plan.integrationMode;
    if (integrationMode === 'apply_all' && smartInput.question) {
      const confirm = (await smartInput.question('apply_all applies patches aggressively. Type APPLY_ALL to confirm: ')).trim();
      if (confirm !== 'APPLY_ALL') {
        integrationMode = 'apply_safe';
      }
    }

    const approved: SwarmPlan = {
      ...plan,
      status: 'approved',
      integrationMode,
      approvedAt: new Date().toISOString(),
    };
    await this.store.savePlan(approved);
    this.emitTrace('swarm.plan.approved', {
      planId: approved.id,
      integrationMode: approved.integrationMode,
      taskCount: approved.tasks.length,
    });
    return { plan: approved, approved: true };
  }

  async confirmIntegrationMode(
    mode: SwarmIntegrationMode,
    smartInput?: SmartInputLike,
  ): Promise<SwarmIntegrationMode> {
    if (mode !== 'apply_all' || !smartInput?.question) {
      return mode;
    }
    const confirm = (await smartInput.question('Type APPLY_ALL to enable apply_all integration: ')).trim();
    return confirm === 'APPLY_ALL' ? 'apply_all' : 'apply_safe';
  }

  private emitTrace(type: TraceEventType, payload: Record<string, unknown>): void {
    try {
      const context = this.traceContext.getCurrent();
      this.traceWriter.append({
        eventId: crypto.randomUUID(),
        sessionId: context.sessionId,
        runId: context.rootRunId,
        type,
        payload,
      });
    } catch {
      // best-effort
    }
  }
}
