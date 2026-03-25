export type AgentEventType =
  | 'agent.task.started'
  | 'agent.task.completed'
  | 'agent.task.failed'
  | 'agent.tool.called'
  | 'agent.tool.completed'
  | 'agent.tool.failed'
  | 'agent.message.sent'
  | 'agent.message.received'
  | 'agent.thinking'
  | 'agent.idle'
  | 'instance.created'
  | 'instance.destroyed'
  | 'room.message'
  | 'bridge.connected'
  | 'bridge.disconnected';

export interface CastEvent {
  id: string;
  type: AgentEventType;
  agentId: string;
  instanceId: string;
  roomId: string;
  source: 'native' | 'bridge';
  payload: {
    taskId?: string;
    taskSubject?: string;
    taskStatus?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolOutput?: string;
    message?: string;
    toAgentId?: string;
    fromAgentId?: string;
    traceId?: string;
    tokens?: number;
    latencyMs?: number;
    error?: string;
    instanceName?: string;
    model?: string;
    provider?: string;
    color?: string;
    bridgeTool?: string;
  };
  timestamp: number;
}
