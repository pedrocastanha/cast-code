// ============================================
// ROOM TYPES
// ============================================

export type AgentRole = 'orchestrator' | 'researcher' | 'coder' | 'reviewer' | 'specialist';

export type TilePattern = 'checkerboard' | 'wood' | 'grass' | 'metal' | 'tiles';

export interface AgentPersona {
  role: AgentRole;
  name: string;
  systemPromptPrefix: string;
  taskMetaphor: string;
  toolMetaphor: string;
  idleLines: string[];
}

export interface RoomKanban {
  todo: string;
  doing: string;
  done: string;
  blocked: string;
  failed: string;
}

export interface AmbientObject {
  type: string;
  isoX: number;
  isoY: number;
  width: number;
}

export interface RoomVisual {
  bg: string;
  floor: string;
  accent: string;
  wall: string;
  light: string;
  emoji: string;
  tilePattern: TilePattern;
  ambientObjects: AmbientObject[];
}

export interface RoomConfig {
  id: string;
  name: string;
  description: string;
  orchestrator: AgentPersona;
  subagents: AgentPersona[];
  kanban: RoomKanban;
  visual: RoomVisual;
}

// ============================================
// EVENT TYPES
// ============================================

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

// ============================================
// VISUAL STATE TYPES
// ============================================

export type AgentVisualState =
  | 'IDLE'
  | 'THINKING'
  | 'WORKING'
  | 'TOOL_USE'
  | 'TALKING'
  | 'CELEBRATING';

export interface AgentBubble {
  type: 'speech' | 'thought' | 'tool';
  text: string;
  visible: boolean;
  createdAt: number;
}

export interface RoomAgent {
  id: string;
  name: string;
  role: string;
  instanceId: string;
  instanceColor: string;
  visualState: AgentVisualState;
  bubble: AgentBubble;
  isoX: number;
  isoY: number;
  animTick: number;
}

export interface RoomInstance {
  id: string;
  name: string;
  model: string;
  provider: string;
  roomId: string;
  color: string;
  status: 'connecting' | 'active' | 'idle' | 'error';
  source: 'native' | 'bridge';
  bridgeTool?: string;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  agentName: string;
  instanceId: string;
  instanceColor: string;
  content: string;
  type: 'message' | 'tool_call' | 'task_event' | 'bridge';
  timestamp: number;
}

export interface ConnectionLine {
  fromAgentId: string;
  toAgentId: string;
  createdAt: number;
}

export interface KanbanTask {
  id: string;
  subject: string;
  status: 'todo' | 'doing' | 'done' | 'blocked' | 'failed';
  agentId: string;
}
