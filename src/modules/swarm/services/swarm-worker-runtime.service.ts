import { Injectable, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SandboxCommandRunnerService } from '../../sandbox/services/sandbox-command-runner.service';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import type { TraceEventType } from '../../trace/types/trace.types';
import type { SwarmHandoff, SwarmPermissionContext, SwarmTaskRun, SwarmWorkerRunInput } from '../types';
import { SwarmBridgeRuntimeService } from './swarm-bridge-runtime.service';
import { SwarmOwnershipService } from './swarm-ownership.service';
import { SwarmWorktreeService } from './swarm-worktree.service';

@Injectable()
export class SwarmWorkerRuntimeService {
  private isolatedAgent?: import('./swarm-isolated-agent.service').SwarmIsolatedAgentService;

  constructor(
    private readonly worktree: SwarmWorktreeService,
    private readonly ownership: SwarmOwnershipService,
    private readonly commands: SandboxCommandRunnerService,
    @Optional() private readonly bridgeRuntime?: SwarmBridgeRuntimeService,
    @Optional() private readonly traceWriter?: TraceWriterService,
    @Optional() private readonly traceContext?: TraceContextService,
  ) {}

  buildPermissionContext(input: Pick<SwarmWorkerRunInput, 'plan' | 'planTask' | 'taskRun' | 'worktree'>): SwarmPermissionContext {
    return {
      runId: input.worktree.runId,
      taskRunId: input.taskRun.id,
      workerId: input.planTask.worker.id,
      mode: 'headless',
      allowedCommandRules: [],
      allowedWriteGlobs: input.planTask.fileOwnership.map((entry) => entry.glob),
      deniedWriteGlobs: input.plan.globalConstraints.denyPaths ?? [],
    };
  }

  async execute(input: SwarmWorkerRunInput): Promise<{ taskRun: SwarmTaskRun; handoff: SwarmHandoff }> {
    const startedAt = new Date().toISOString();
    let taskRun: SwarmTaskRun = {
      ...input.taskRun,
      status: 'running',
      worktreePath: input.worktree.worktreePath,
      branchName: input.worktree.branchName,
      startedAt,
    };

    this.emitTrace('swarm.task.started', {
      runId: input.worktree.runId,
      taskId: input.planTask.id,
      workerId: input.planTask.worker.id,
      dryRun: Boolean(input.dryRun),
    });

    try {
      const summary = input.dryRun
        ? await this.executeDryRun(input)
        : input.plan.runtimePolicy.kind === 'bridge'
          ? await this.getBridgeRuntime().runWorker(input)
          : await this.getIsolatedAgent().runWorker(input);

      const capture = await this.worktree.captureDiff(input.worktree.worktreePath);
      const violations = capture.changedFiles.filter((file) =>
        !this.ownership.matchesOwnership(file, input.planTask.fileOwnership),
      );

      const testsRun = await this.runFocusedVerification(input);
      const handoff: SwarmHandoff = {
        summary: this.truncate(summary || 'Worker completed without narrative output.', input.planTask.worker.handoffFormat.summaryMaxChars),
        changedFiles: capture.changedFiles,
        decisions: input.planTask.worker.handoffFormat.includeDecisions ? [] : [],
        testsRun,
        blockers: violations.length > 0
          ? [`Changed files outside ownership: ${violations.join(', ')}`]
          : [],
        expansionRequests: [],
        skillsUsed: input.planTask.injectedSkills,
      };

      taskRun = {
        ...taskRun,
        status: violations.length > 0 ? 'blocked' : 'completed',
        endedAt: new Date().toISOString(),
        handoff,
      };

      this.emitTrace(
        violations.length > 0 ? 'swarm.task.failed' : 'swarm.task.completed',
        {
          runId: input.worktree.runId,
          taskId: input.planTask.id,
          changedFiles: capture.changedFiles.length,
          violations: violations.length,
        },
      );

      return { taskRun, handoff };
    } catch (error) {
      taskRun = {
        ...taskRun,
        status: 'failed',
        endedAt: new Date().toISOString(),
        handoff: {
          summary: `Worker failed: ${(error as Error).message}`,
          changedFiles: [],
          decisions: [],
          testsRun: [],
          blockers: [(error as Error).message],
          expansionRequests: [],
        },
      };
      this.emitTrace('swarm.task.failed', {
        runId: input.worktree.runId,
        taskId: input.planTask.id,
        error: (error as Error).message,
      });
      return { taskRun, handoff: taskRun.handoff! };
    }
  }

  private async executeDryRun(input: SwarmWorkerRunInput): Promise<string> {
    const marker = path.join('.cast', 'swarm', input.worktree.runId, `${input.planTask.id}.md`);
    const absolute = path.join(input.worktree.worktreePath, marker);
    const content = [
      '# Swarm dry-run marker',
      `Task: ${input.planTask.title}`,
      `Worker: ${input.planTask.worker.name}`,
      `Generated: ${new Date().toISOString()}`,
    ].join('\n');
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, 'utf-8');
    return `Dry-run completed for ${input.planTask.id}. No model execution was performed.`;
  }

  private async runFocusedVerification(input: SwarmWorkerRunInput): Promise<SwarmHandoff['testsRun']> {
    const results: SwarmHandoff['testsRun'] = [];
    for (const step of input.planTask.focusedVerification) {
      const result = await this.commands.run('bash', ['-lc', step.command], {
        cwd: input.worktree.worktreePath,
      });
      results.push({
        command: step.command,
        status: result.exitCode === 0 ? 'passed' : 'failed',
        outputPreview: (result.stderr || result.stdout).slice(0, 240),
      });
    }
    return results;
  }

  private getBridgeRuntime(): SwarmBridgeRuntimeService {
    if (!this.bridgeRuntime) {
      throw new Error('SwarmBridgeRuntimeService is not available. Import SwarmModule with BridgeModule.');
    }
    return this.bridgeRuntime;
  }

  private getIsolatedAgent(): import('./swarm-isolated-agent.service').SwarmIsolatedAgentService {
    if (!this.isolatedAgent) {
      throw new Error('SwarmIsolatedAgentService is not wired. Import SwarmModule in the active Nest context.');
    }
    return this.isolatedAgent;
  }

  setIsolatedAgent(service: import('./swarm-isolated-agent.service').SwarmIsolatedAgentService): void {
    this.isolatedAgent = service;
  }

  private truncate(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars - 3)}...`;
  }

  private emitTrace(type: TraceEventType, payload: Record<string, unknown>): void {
    try {
      const context = this.traceContext?.getCurrent();
      if (!context || !this.traceWriter) return;
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
