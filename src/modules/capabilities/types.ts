import { StructuredTool } from '@langchain/core/tools';

export interface ToolCapability {
  name: string;
  description: string;
  getter: () => StructuredTool[];
}

export interface SkillCapability {
  name: string;
  description: string;
  tools: string[];
  guidelines: string;
}

export interface AgentCapability {
  name: string;
  description: string;
  skills: string[];
  mcp: string[];
  model?: string;
  temperature?: number;
  systemPrompt: string;
}

export interface ResolvedCapability {
  name: string;
  description: string;
  tools: StructuredTool[];
  systemPrompt?: string;
  mcp?: string[];
}

export interface ToolRegistrationRequest {
  source: string;
  tools: ToolCapability[];
}

export interface SkillRegistrationRequest {
  skills: SkillCapability[];
}

export interface AgentRegistrationRequest {
  agents: AgentCapability[];
}

export interface CapabilityQuery {
  toolNames?: string[];
  skillNames?: string[];
  agentNames?: string[];
}

export interface CapabilityResult {
  tools: StructuredTool[];
  skills: SkillCapability[];
  agents: AgentCapability[];
}
