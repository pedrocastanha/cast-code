import { StructuredTool } from '@langchain/core/tools';

export interface AgentFrontmatter {
  name: string;
  description: string;
  model?: string;
  temperature?: number;
  skills: string[];
  mcp?: string[];
}

export interface AgentDefinition {
  name: string;
  description: string;
  model: string;
  temperature: number;
  skills: string[];
  mcp: string[];
  systemPrompt: string;
}

export interface ResolvedAgent {
  name: string;
  description: string;
  model: string;
  temperature: number;
  tools: StructuredTool[];
  systemPrompt: string;
  mcp: string[];
}

export interface SubagentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools: StructuredTool[];
  mcp?: string[];
}
