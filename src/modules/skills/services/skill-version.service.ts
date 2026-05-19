import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { SkillDefinition } from '../types';

@Injectable()
export class SkillVersionService {
  hashSkill(skill: SkillDefinition): string {
    const payload = JSON.stringify({
      name: skill.name,
      description: skill.description,
      tools: skill.tools,
      guidelines: skill.guidelines,
      aliases: skill.aliases,
      environments: skill.environments,
      profiles: skill.profiles,
      supportFiles: skill.supportFiles,
      source: skill.source,
      sourcePath: skill.sourcePath,
      definitionPath: skill.definitionPath,
      packageRoot: skill.packageRoot,
      risk: skill.risk,
      trust: skill.trust,
      isActive: skill.isActive,
    });
    return createHash('sha256').update(payload).digest('hex').slice(0, 12);
  }
}
