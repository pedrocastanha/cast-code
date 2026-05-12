import { Injectable } from '@nestjs/common';

import { DiscoveredHermesSkill, SkillEnvironmentTag } from '../types/skills-import.types';

const ENVIRONMENT_KEYWORDS: Record<SkillEnvironmentTag, RegExp[]> = {
  marketing: [/\bcampaign\b/i, /\bcopy\b/i, /\bads?\b/i, /\bseo\b/i, /\bcontent\b/i],
  design: [/\bfigma\b/i, /\bdesign\b/i, /\bui\b/i, /\bvisual\b/i, /\baccessibility\b/i],
  engineering: [/\btest(s|ing)?\b/i, /\bdebug\b/i, /\b(code|diff|pr|pull request)\s+review\b/i, /\breview\b.{0,30}\b(code|diff|pr|pull request)\b/i, /\brefactor\b/i, /\bgit\b/i],
  data: [/\bsql\b/i, /\bdata\b/i, /\banalysis\b/i, /\banalyze\b/i, /\bchart\b/i],
  support: [/\bsupport\b/i, /\bticket\b/i, /\bcustomer\b/i],
};

@Injectable()
export class SkillEnvironmentClassifierService {
  classify(skill: Pick<DiscoveredHermesSkill, 'name' | 'description' | 'body'>): SkillEnvironmentTag[] {
    const text = [skill.name, skill.description, skill.body].join('\n');
    const matches: SkillEnvironmentTag[] = [];

    for (const environment of Object.keys(ENVIRONMENT_KEYWORDS) as SkillEnvironmentTag[]) {
      if (ENVIRONMENT_KEYWORDS[environment].some((pattern) => pattern.test(text))) {
        matches.push(environment);
      }
    }

    return matches.length > 0 ? matches : ['engineering'];
  }
}
