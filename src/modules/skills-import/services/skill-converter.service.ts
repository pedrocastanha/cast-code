import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';

import { SkillConversionInput } from '../types/skills-import.types';
import { normalizeSkillContentForCast } from '../../skills/services/skill-content-normalizer';

@Injectable()
export class SkillConverterService {
  convertToMarkdown(input: SkillConversionInput): string {
    const { skill, scan, environments, tags } = input;
    const data = {
      name: skill.name,
      description: skill.description,
      tools: this.readTools(skill.frontmatter),
      trust: scan.risk === 'critical' ? 'quarantined' : 'community',
      risk: scan.risk,
      environments,
      tags,
      scannerFindings: scan.findings,
      isActive: false,
    };

    const sections = [
      '<!-- Imported skill. Review scanner findings and activate only after approval. -->',
      '',
      normalizeSkillContentForCast(skill.body).trim(),
    ];

    if (skill.supportFiles.length > 0) {
      sections.push('', '## Imported Support Files', '', ...skill.supportFiles.map((file) => `- ${file}`));
    }

    return matter.stringify(sections.join('\n'), data).trimEnd() + '\n';
  }

  private readTools(frontmatter: Record<string, unknown>): string[] {
    const tools = frontmatter.tools;
    if (!Array.isArray(tools)) {
      return [];
    }
    return tools.map(String);
  }
}
