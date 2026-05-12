import type { BenchmarkBudget, BenchmarkRun } from '../../benchmark/types';
import type { SandboxRunConfig } from '../../sandbox/types';

export type ScheduleTargetType =
  | 'benchmark'
  | 'environment_task'
  | 'agent_prompt'
  | 'rag_refresh'
  | 'report'
  | 'shell_command';

export type ScheduleStatus = 'active' | 'paused';

export type ScheduleApprovalPolicy =
  | 'dry-run-only'
  | 'approval-required'
  | 'pre-approved';

export type ScheduleRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'timeout';

export interface ScheduleTarget {
  type: ScheduleTargetType;
  ref?: string;
  config: Record<string, unknown>;
}

export interface ScheduleDefinition {
  id: string;
  projectRoot: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  status: ScheduleStatus;
  target: ScheduleTarget;
  environmentId?: string;
  approvalPolicy: ScheduleApprovalPolicy;
  budget?: BenchmarkBudget & {
    maxRuntimeMs?: number;
  };
  sandbox?: SandboxRunConfig;
  maxRuntimeMs: number;
  nextRunAt?: string;
  lastRunAt?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  projectRoot: string;
  status: ScheduleRunStatus;
  startedAt: string;
  completedAt?: string;
  dueAt?: string;
  targetType: ScheduleTargetType;
  summary?: Record<string, unknown>;
  error?: string;
  benchmarkRunId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateScheduleInput {
  id?: string;
  projectRoot: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  target: ScheduleTarget;
  environmentId?: string;
  approvalPolicy?: ScheduleApprovalPolicy;
  budget?: ScheduleDefinition['budget'];
  sandbox?: SandboxRunConfig;
  maxRuntimeMs?: number;
  tags?: string[];
}

export interface SchedulePolicyDecision {
  allowed: boolean;
  reason?: string;
  severity: 'ok' | 'warning' | 'blocked';
  requiresInteractiveApproval: boolean;
}

export interface ScheduleRunResult {
  schedule: ScheduleDefinition;
  run: ScheduleRun;
  benchmarkRun?: BenchmarkRun;
}

export interface DueScheduleRunResult {
  checkedAt: string;
  runs: ScheduleRunResult[];
}
