export interface LocalSession {
  id: string;
  projectRoot: string;
  platformProjectId?: string;
  environmentId?: string;
  startedAt: string;
  endedAt?: string;
  model?: string;
  totalTokens: number;
  totalCost: number;
}

export interface LocalMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  contentPreview?: string;
  contentHash?: string;
  redactedContent?: string;
  createdAt: string;
}

export interface LocalToolCall {
  id: string;
  sessionId: string;
  messageId?: string;
  toolName: string;
  inputRedacted?: string;
  outputPreview?: string;
  status: 'ok' | 'error' | 'denied' | 'cancelled';
  latencyMs?: number;
  createdAt: string;
}

export interface LocalSearchResult {
  kind: 'message' | 'tool_call';
  id: string;
  sessionId: string;
  title: string;
  preview: string;
  createdAt: string;
}

export interface LocalStateConfig {
  stateDir?: string;
  dbPath?: string;
}
