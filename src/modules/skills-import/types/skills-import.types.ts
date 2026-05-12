import { SkillDefinition, SkillRisk, SkillScannerFinding, SkillScannerFindingCategory } from '../../skills/types';

export type SkillEnvironmentTag = 'marketing' | 'design' | 'engineering' | 'data' | 'support';

export interface DiscoveredHermesSkill {
  name: string;
  description: string;
  sourcePath: string;
  body: string;
  supportFiles: string[];
  frontmatter: Record<string, unknown>;
}

export interface SkillRiskFinding extends SkillScannerFinding {
  category: SkillScannerFindingCategory;
  severity: SkillRisk;
}

export interface SkillRiskScanReport {
  risk: SkillRisk;
  findings: SkillRiskFinding[];
}

export type SkillDuplicateStatus = 'none' | 'duplicateName' | 'duplicateContent' | 'similar';

export interface SkillDuplicateMatch {
  name: string;
  status: Exclude<SkillDuplicateStatus, 'none'>;
  score?: number;
}

export interface SkillDuplicateReport {
  status: SkillDuplicateStatus;
  matches: SkillDuplicateMatch[];
}

export interface SkillImportReportItem {
  skill: DiscoveredHermesSkill;
  risk: SkillRisk;
  findings: SkillRiskFinding[];
  environments: SkillEnvironmentTag[];
  tags: string[];
  duplicate: SkillDuplicateReport;
}

export interface SkillsImportReport {
  discovered: number;
  countsByRisk: Record<SkillRisk, number>;
  items: SkillImportReportItem[];
}

export interface SkillConversionInput {
  skill: DiscoveredHermesSkill;
  scan: SkillRiskScanReport;
  environments: SkillEnvironmentTag[];
  tags: string[];
}

export type ExistingSkillForDuplicateDetection = Pick<SkillDefinition, 'name' | 'description' | 'guidelines'>;
