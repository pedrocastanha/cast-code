export type McpTransportType = 'sse' | 'stdio' | 'http';

export interface McpConfig {
  type: McpTransportType;
  endpoint?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpConnection {
  config: McpConfig;
  process?: unknown;
  tools: McpTool[];
  status: McpConnectionStatus;
}
