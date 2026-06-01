export type CastRuntimeScope =
  | { kind: 'main'; runId: string }
  | { kind: 'bridge'; runId: string; provider: string }
  | { kind: 'swarm'; runId: string }
  | { kind: 'worker'; runId: string; taskId: string; workerId: string }
  | { kind: 'subagent'; runId: string; subagentId: string; parentId?: string };

export type RuntimePrivacy = 'local' | 'sanitized';

export interface RuntimeEventBase {
  id: string;
  seq: number;
  timestamp: string;
  type: CastRuntimeEventType;
  scope: CastRuntimeScope;
  parentEventId?: string;
  correlationId?: string;
  privacy: RuntimePrivacy;
}

export interface RuntimeRunStartedEvent extends RuntimeEventBase {
  type: 'runtime.run.started';
  runtime: 'model' | 'bridge' | 'swarm';
  provider?: string;
  providerLabel?: string;
  model?: string;
}

export interface RuntimeRunCompletedEvent extends RuntimeEventBase {
  type: 'runtime.run.completed';
  status: 'completed' | 'canceled';
  durationMs?: number;
  toolRounds?: number;
  outputLength?: number;
}

export interface RuntimeRunFailedEvent extends RuntimeEventBase {
  type: 'runtime.run.failed';
  errorClass?: string;
  message?: string;
  durationMs?: number;
}

export interface RuntimeMessageDeltaEvent extends RuntimeEventBase {
  type: 'runtime.message.delta';
  text: string;
}

export interface RuntimeMessageCompletedEvent extends RuntimeEventBase {
  type: 'runtime.message.completed';
  text?: string;
  outputLength?: number;
}

export interface RuntimeToolStartedEvent extends RuntimeEventBase {
  type: 'runtime.tool.started';
  toolName: string;
  callId?: string;
  input?: unknown;
}

export interface RuntimeToolDeltaEvent extends RuntimeEventBase {
  type: 'runtime.tool.delta';
  toolName: string;
  callId?: string;
  summary?: string;
}

export interface RuntimeToolCompletedEvent extends RuntimeEventBase {
  type: 'runtime.tool.completed';
  toolName: string;
  callId?: string;
  status: 'ok';
  durationMs?: number;
  summary?: string;
  outputPreview?: string;
}

export interface RuntimeToolFailedEvent extends RuntimeEventBase {
  type: 'runtime.tool.failed';
  toolName: string;
  callId?: string;
  status?: 'error';
  durationMs?: number;
  errorClass?: string;
  message?: string;
  summary?: string;
}

export interface RuntimeSubagentStartedEvent extends RuntimeEventBase {
  type: 'runtime.subagent.started';
  subagentId: string;
  name?: string;
}

export interface RuntimeSubagentCompletedEvent extends RuntimeEventBase {
  type: 'runtime.subagent.completed';
  subagentId: string;
  status: 'completed';
  durationMs?: number;
  summary?: string;
}

export interface RuntimeSubagentFailedEvent extends RuntimeEventBase {
  type: 'runtime.subagent.failed';
  subagentId: string;
  errorClass?: string;
  message?: string;
  durationMs?: number;
}

export interface RuntimeSwarmPlanCreatedEvent extends RuntimeEventBase {
  type: 'swarm.plan.created';
  planId: string;
  taskCount?: number;
  maxWorkers?: number;
  integrationMode?: string;
}

export interface RuntimeSwarmPlanApprovedEvent extends RuntimeEventBase {
  type: 'swarm.plan.approved';
  planId: string;
  runId: string;
  integrationMode?: string;
}

export interface RuntimeSwarmRunStartedEvent extends RuntimeEventBase {
  type: 'swarm.run.started';
  runId: string;
  taskCount?: number;
  maxWorkers?: number;
  runtime?: string;
}

export interface RuntimeSwarmRunCompletedEvent extends RuntimeEventBase {
  type: 'swarm.run.completed';
  runId: string;
  status: 'completed' | 'canceled';
  durationMs?: number;
  filesChanged?: number;
}

export interface RuntimeSwarmRunFailedEvent extends RuntimeEventBase {
  type: 'swarm.run.failed';
  runId: string;
  errorClass?: string;
  message?: string;
}

export interface RuntimeSwarmTaskStartedEvent extends RuntimeEventBase {
  type: 'swarm.task.started';
  taskId: string;
  workerId?: string;
}

export interface RuntimeSwarmTaskCompletedEvent extends RuntimeEventBase {
  type: 'swarm.task.completed';
  taskId: string;
  status: 'completed';
  workerId?: string;
  filesChanged?: number;
}

export interface RuntimeSwarmTaskFailedEvent extends RuntimeEventBase {
  type: 'swarm.task.failed';
  taskId: string;
  workerId?: string;
  errorClass?: string;
  message?: string;
}

export interface RuntimeSwarmIntegrationEvent extends RuntimeEventBase {
  type: 'swarm.integration.started' | 'swarm.integration.completed' | 'swarm.integration.blocked';
  runId: string;
  mode?: string;
  status?: string;
  filesApplied?: number;
  filesBlocked?: number;
  reason?: string;
}

export interface RuntimeVerificationEvent extends RuntimeEventBase {
  type: 'verification.started' | 'verification.completed' | 'verification.failed';
  command?: string;
  status?: string;
  durationMs?: number;
  errorClass?: string;
  message?: string;
}

export interface RuntimeUsageEvent extends RuntimeEventBase {
  type: 'runtime.usage';
  input?: number;
  cachedInput?: number;
  output?: number;
  model?: string;
  cost?: number;
}

export type CastRuntimeEvent =
  | RuntimeRunStartedEvent
  | RuntimeRunCompletedEvent
  | RuntimeRunFailedEvent
  | RuntimeMessageDeltaEvent
  | RuntimeMessageCompletedEvent
  | RuntimeToolStartedEvent
  | RuntimeToolDeltaEvent
  | RuntimeToolCompletedEvent
  | RuntimeToolFailedEvent
  | RuntimeSubagentStartedEvent
  | RuntimeSubagentCompletedEvent
  | RuntimeSubagentFailedEvent
  | RuntimeSwarmPlanCreatedEvent
  | RuntimeSwarmPlanApprovedEvent
  | RuntimeSwarmRunStartedEvent
  | RuntimeSwarmRunCompletedEvent
  | RuntimeSwarmRunFailedEvent
  | RuntimeSwarmTaskStartedEvent
  | RuntimeSwarmTaskCompletedEvent
  | RuntimeSwarmTaskFailedEvent
  | RuntimeSwarmIntegrationEvent
  | RuntimeVerificationEvent
  | RuntimeUsageEvent;

export type CastRuntimeEventType = CastRuntimeEvent['type'];
