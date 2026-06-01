import { Injectable } from '@nestjs/common';
import { SkillDefinition } from '../types';

export interface SkillValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface SkillValidationResult {
  ok: boolean;
  errors: SkillValidationIssue[];
  warnings: SkillValidationIssue[];
}

@Injectable()
export class SkillValidationService {
  validate(skill: SkillDefinition): SkillValidationResult {
    const errors: SkillValidationIssue[] = [];
    const warnings: SkillValidationIssue[] = [];

    if (!skill.name || !skill.name.trim()) {
      errors.push({ code: 'missing_name', message: 'Skill name is required.' });
    }
    if (!Array.isArray(skill.tools)) {
      errors.push({ code: 'invalid_tools', message: 'Skill tools must be an array.' });
    }
    for (const file of skill.supportFiles || []) {
      if (file.startsWith('/') || file.includes('..')) {
        errors.push({ code: 'invalid_support_file', message: 'Support file path must stay inside the skill package.', path: file });
      }
    }
    if (!skill.description) {
      warnings.push({ code: 'missing_description', message: 'Skill description is empty.' });
    }

    return { ok: errors.length === 0, errors, warnings };
  }
}
