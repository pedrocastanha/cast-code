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
}

export interface ResolvedSkill {
  name: string;
  description: string;
  tools: unknown[];
  guidelines: string;
}
