export type ToolCallStatus = 'running' | 'ok' | 'error';

export type ToolUiEvent =
  | {
    type: 'started';
    toolName: string;
    callId?: string;
    agentId?: string;
    input?: unknown;
  }
  | {
    type: 'completed';
    toolName: string;
    callId?: string;
    agentId?: string;
    output?: string;
    durationMs?: number;
  }
  | {
    type: 'failed';
    toolName: string;
    callId?: string;
    agentId?: string;
    message?: string;
    durationMs?: number;
  };

export type AgentUiEvent =
  | { type: 'spawned'; agentId: string; agentName: string; task: string }
  | { type: 'progress'; agentId: string; currentTool?: string; tokens?: number }
  | {
    type: 'completed';
    agentId: string;
    durationMs: number;
    tokens?: number;
    summary?: string;
  }
  | { type: 'failed'; agentId: string; durationMs: number; error: string };

export type ChatStreamChunk =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; event: ToolUiEvent }
  | { kind: 'agent'; event: AgentUiEvent };

export interface ToolCallRenderState {
  id: string;
  toolName: string;
  inputSummary: string;
  status: ToolCallStatus;
  output?: string;
  durationMs?: number;
  expanded?: boolean;
  errorMessage?: string;
}

export interface ToolCallRenderResult {
  content: string;
  lineCount: number;
}
