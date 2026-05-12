import { StructuredTool } from '@langchain/core/tools';

export type SkillTrust = 'builtin' | 'trusted' | 'community' | 'local' | 'quarantined';
export type SkillRisk = 'low' | 'medium' | 'high' | 'critical';
export type SkillSource = 'builtin' | 'local' | 'remote' | 'hermes-import';
export type SkillScannerFindingCategory =
  | 'prompt_injection'
  | 'credential_exfiltration'
  | 'destructive_shell'
  | 'network_exfiltration'
  | 'system_override';

export interface SkillScannerFinding {
  category: SkillScannerFindingCategory;
  severity: SkillRisk;
  message: string;
  match?: string;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  tools: string[];
  environments?: string[];
  source?: SkillSource;
  sourceRepo?: string;
  sourcePath?: string;
  trust?: SkillTrust;
  risk?: SkillRisk;
  tags?: string[];
  scannerFindings?: SkillScannerFinding[];
  isActive?: boolean;
}

export interface SkillDefinition {
  name: string;
  description: string;
  tools: string[];
  guidelines: string;
  environments?: string[];
  source?: SkillSource;
  sourceRepo?: string;
  sourcePath?: string;
  trust?: SkillTrust;
  risk?: SkillRisk;
  tags?: string[];
  scannerFindings?: SkillScannerFinding[];
  isActive?: boolean;
  updatedAt?: string;
}

export interface ResolvedSkill {
  name: string;
  description: string;
  tools: StructuredTool[];
  guidelines: string;
}
