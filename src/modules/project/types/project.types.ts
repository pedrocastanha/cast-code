import { McpConfig } from '../../mcp/types';
import { AgentDefinition } from '../../agents/types';

export interface ProjectContextFrontmatter {
  name: string;
  stack?: string[];
  conventions?: string[];
}

export interface ProjectContext {
  name: string;
  stack: string[];
  conventions: string[];
  description: string;
  structure?: Record<string, string>;
  rules?: string[];
}

export interface ProjectConfig {
  context?: ProjectContext;
  agentOverrides?: Record<string, Partial<AgentDefinition>>;
  mcpConfigs?: Record<string, McpConfig>;
}

export interface ProjectInitResult {
  projectPath: string | null;
  hasContext: boolean;
  agentCount: number;
  toolCount: number;
}
