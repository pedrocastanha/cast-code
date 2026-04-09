import { StructuredTool } from '@langchain/core/tools';
import { SubagentDefinition } from '../../../agents/types';
import { McpServerSummary } from '../../../mcp/types';

export interface PromptBuilderContext {
  projectRoot: string;
  platform: string;
  nodeVersion: string;
  languageInstruction: string;
  tools: StructuredTool[];
  mcpTools: StructuredTool[];
  mcpServerSummaries: McpServerSummary[];
  subagents: SubagentDefinition[];
  gitInfo: string;
  contextPrompt: string;
  memoryPrompt: string;
  skillCount: number;
  projectStructure?: string;
}

export interface PromptSection {
  id: string;
  build(ctx: PromptBuilderContext): string;
}
