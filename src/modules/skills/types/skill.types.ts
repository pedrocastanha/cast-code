import { StructuredTool } from '@langchain/core/tools';

export interface SkillFrontmatter {
  name: string;
  description: string;
  tools: string[];
}

export interface SkillDefinition {
  name: string;
  description: string;
  tools: string[];
  guidelines: string;
  source?: 'builtin' | 'local' | 'remote';
  updatedAt?: string;
}

export interface ResolvedSkill {
  name: string;
  description: string;
  tools: StructuredTool[];
  guidelines: string;
}
