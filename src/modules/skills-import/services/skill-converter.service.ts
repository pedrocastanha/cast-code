import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';

import { SkillConversionInput } from '../types/skills-import.types';

@Injectable()
export class SkillConverterService {
  convertToMarkdown(input: SkillConversionInput): string {
    const { skill, scan, environments, tags } = input;
    const data = {
      name: skill.name,
      description: skill.description,
      tools: this.readTools(skill.frontmatter),
      source: 'hermes-import',
      sourceRepo: 'nousresearch/hermes-agent',
      sourcePath: skill.sourcePath,
      trust: scan.risk === 'critical' ? 'quarantined' : 'community',
      risk: scan.risk,
      environments,
      tags,
      scannerFindings: scan.findings,
      isActive: false,
    };

    const sections = [
      '<!-- Imported from Hermes. Review scanner findings and activate only after approval. -->',
      '',
      skill.body.trim(),
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
