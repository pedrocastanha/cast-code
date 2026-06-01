import { Injectable } from '@nestjs/common';
import type { BenchmarkDefinition } from '../../benchmark/types';
import {
  ScheduleDefinition,
  SchedulePolicyDecision,
} from '../types';

const MUTATION_PATTERNS = [
  /\b(delete|drop|truncate|destroy|reset|wipe)\b/i,
  /\bdeploy(?:ment)?\b/i,
  /\bproduction\b/i,
  /\bad[_-]?spend\b/i,
  /\bcampaign[_-]?publish\b/i,
  /\bexternal[_-]?post\b/i,
  /\baccount[_-]?mutation\b/i,
  /\bgit\s+push\b/i,
  /\brm\s+-rf\b/i,
];

@Injectable()
export class SchedulePolicyService {
  assess(
    schedule: ScheduleDefinition,
    options: { benchmark?: BenchmarkDefinition | null; unattended?: boolean } = {},
  ): SchedulePolicyDecision {
    if (this.requiresBudget(schedule) && !schedule.budget && !options.benchmark?.budget) {
      return this.blocked('Scheduled benchmark and agent tasks require an explicit budget on the schedule or benchmark definition.');
    }

    if (schedule.maxRuntimeMs <= 0 || schedule.maxRuntimeMs > 24 * 60 * 60 * 1000) {
      return this.blocked('Schedule maxRuntimeMs must be between 1ms and 24h.');
    }

    if (schedule.target.type === 'shell_command') {
      if (schedule.approvalPolicy !== 'pre-approved') {
        return this.blocked('Shell command schedules require approvalPolicy=pre-approved.');
      }
      return this.scanMutationRisk(schedule);
    }

    const writeEnabled = this.writeEnabledReason(schedule, options.benchmark ?? null);
    if (schedule.approvalPolicy === 'dry-run-only' && writeEnabled) {
      return this.blocked(`This schedule is marked dry-run-only but ${writeEnabled} enables writes.`);
    }

    const mutationDecision = this.scanMutationRisk(schedule, options.benchmark ?? null);
    if (!mutationDecision.allowed) {
      return mutationDecision;
    }

    if (schedule.approvalPolicy === 'approval-required' && options.unattended) {
      return {
        allowed: false,
        severity: 'blocked',
        requiresInteractiveApproval: true,
        reason: 'This schedule requires interactive approval and cannot run unattended.',
      };
    }

    return {
      allowed: true,
      severity: schedule.approvalPolicy === 'pre-approved' ? 'warning' : 'ok',
      requiresInteractiveApproval: schedule.approvalPolicy === 'approval-required',
    };
  }

  private scanMutationRisk(schedule: ScheduleDefinition, benchmark: BenchmarkDefinition | null = null): SchedulePolicyDecision {
    const body = JSON.stringify({
      schedule: {
        type: schedule.target.type,
        ref: schedule.target.ref,
        config: schedule.target.config,
      },
      benchmark: benchmark ? {
        type: benchmark.target.type,
        config: benchmark.target.config,
        tags: benchmark.tags,
      } : undefined,
      tags: schedule.tags,
    });
    const risky = MUTATION_PATTERNS.find((pattern) => pattern.test(body));
    if (!risky) {
      return { allowed: true, severity: 'ok', requiresInteractiveApproval: false };
    }

    if (schedule.approvalPolicy !== 'pre-approved') {
      return this.blocked(`Schedule target looks mutation-capable (${risky.source}); set approvalPolicy=pre-approved only for controlled jobs.`);
    }

    return {
      allowed: true,
      severity: 'warning',
      requiresInteractiveApproval: false,
      reason: 'Mutation-capable schedule is pre-approved.',
    };
  }

  private requiresBudget(schedule: ScheduleDefinition): boolean {
    return schedule.target.type === 'benchmark'
      || schedule.target.type === 'agent_prompt'
      || schedule.target.type === 'report';
  }

  private writeEnabledReason(schedule: ScheduleDefinition, benchmark: BenchmarkDefinition | null): string | null {
    if (this.isWriteEnabled(schedule.target.config)) {
      return 'target config';
    }
    if (benchmark && this.isWriteEnabled(benchmark.target.config)) {
      return 'referenced benchmark target config';
    }
    return null;
  }

  private isWriteEnabled(config: Record<string, unknown>): boolean {
    return config.dryRun === false
      || config.write === true
      || config.writeEnabled === true
      || config.mutate === true
      || config.mutation === true;
  }

  private blocked(reason: string): SchedulePolicyDecision {
    return {
      allowed: false,
      severity: 'blocked',
      requiresInteractiveApproval: false,
      reason,
    };
  }
}
