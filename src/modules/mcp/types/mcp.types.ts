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

export interface McpCapabilities {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
}

export interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpServerSummary {
  name: string;
  transport: McpTransportType;
  status: string;
  toolCount: number;
  toolNames: string[];
  toolDescriptions: { name: string; description: string }[];
  environments?: string[];
  risk?: string;
  auth?: string;
  mutationPolicy?: string;
  capabilities?: McpCapabilities;
  quarantinedTools?: { name: string; warning: string; reasons: string[] }[];
}

export interface McpConnection {
  config: McpConfig;
  process?: unknown;
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  capabilities: McpCapabilities;
  status: McpConnectionStatus;
  authUrl?: string;
  oauthRefreshAvailable?: boolean;
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
}
