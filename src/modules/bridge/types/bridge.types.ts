export const BRIDGE_PROVIDER_IDS = ['claude', 'codex', 'copilot', 'qwen', 'kimi', 'openrouter'] as const;
export type BridgeProviderId = (typeof BRIDGE_PROVIDER_IDS)[number];
export type BridgeSessionStatus = 'idle' | 'starting' | 'connected' | 'disconnected' | 'error';
export type BridgeTranscriptDirection = 'to_provider' | 'from_provider' | 'tool_call' | 'tool_result' | 'runtime';

export interface BridgeToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface BridgeToolManifest {
  tools: BridgeToolDefinition[];
}

export interface BridgeToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  raw: string;
}

export interface BridgeProtocolError {
  message: string;
  raw: string;
}

export interface BridgeParseResult {
  finalText: string;
  toolCalls: BridgeToolCall[];
  errors: BridgeProtocolError[];
  turnDone: boolean;
}

export interface BridgeToolResult {
  id: string;
  name: string;
  status: 'ok' | 'error';
  content?: string;
  error?: string;
}

export interface BridgeUserTurn {
  id: string;
  message: string;
}

export interface BridgeRuntimeResult {
  output: string;
  toolRounds: number;
}

export interface BridgeRuntimeCallbacks {
  onOutputChunk?(chunk: string): void;
  onToolCall?(call: BridgeToolCall): void;
  onToolResult?(result: BridgeToolResult): void;
}

export interface BridgeTranscriptEvent {
  id: string;
  sessionId: string;
  createdAt: string;
  direction: BridgeTranscriptDirection;
  provider: BridgeProviderId;
  turnId?: string;
  callId?: string;
  redactedText?: string;
  rawTextPath?: string;
  metadata?: Record<string, unknown>;
}
