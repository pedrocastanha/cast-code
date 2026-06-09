export type ToolCallStatus = 'running' | 'ok' | 'error';

export type ToolUiEvent =
  | {
    type: 'started';
    toolName: string;
    callId?: string;
    input?: unknown;
  }
  | {
    type: 'completed';
    toolName: string;
    callId?: string;
    output?: string;
    durationMs?: number;
  }
  | {
    type: 'failed';
    toolName: string;
    callId?: string;
    message?: string;
    durationMs?: number;
  };

export type ChatStreamChunk =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; event: ToolUiEvent };

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
