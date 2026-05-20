export type TraceSchemaVersion = 1;

export type TraceEventType =
  | 'session.started'
  | 'session.ended'
  | 'session.warning'
  | 'session.message'
  | 'agent.queued'
  | 'agent.started'
  | 'agent.tool_call'
  | 'agent.permission_wait'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.cancelled'
  | 'agent.timed_out'
  | 'skill.loaded'
  | 'skill.changed'
  | 'skill.reloaded'
  | 'skill.invalid'
  | 'skill.shadowed'
  | 'skill.injected'
  | 'skill.blocked'
  | 'skill.removed'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  | 'permission.requested'
  | 'permission.granted'
  | 'permission.denied'
  | 'model.requested'
  | 'model.completed'
  | 'file.changed'
  | 'env.activated'
  | 'memory.read'
  | 'memory.written'
  | 'error.raised'
  | 'eval.observed'
  | 'swarm.plan.created'
  | 'swarm.plan.approved'
  | 'swarm.run.started'
  | 'swarm.task.started'
  | 'swarm.task.completed'
  | 'swarm.task.failed'
  | 'swarm.integration.applied'
  | 'swarm.integration.manual_review_required'
  | 'swarm.run.completed';

export interface TraceContext {
  sessionId: string;
  rootRunId: string;
  project: string;
  model?: string;
  startedAt: string;
}

export interface TraceRedaction {
  path: string;
  reason: 'secret_pattern' | 'large_output' | 'binary_output' | 'policy';
}

export interface TraceEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  schemaVersion: TraceSchemaVersion;
  eventId: string;
  sessionId: string;
  runId: string;
  parentRunId?: string;
  timestamp: string;
  type: TraceEventType;
  payload: TPayload;
  redactions: TraceRedaction[];
}

export interface ReplayTraceRef {
  schemaVersion: TraceSchemaVersion;
  sessionId: string;
  rootRunId: string;
  tracePath: string;
  events: number;
}

export interface TraceSanitizeResult<TPayload extends Record<string, unknown>> {
  payload: TPayload;
  redactions: TraceRedaction[];
}
