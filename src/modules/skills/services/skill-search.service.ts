import { Injectable } from '@nestjs/common';

import { AgentDefinition } from '../../agents/types';
import { SkillDefinition, SkillRisk } from '../types';
import { normalizeSkillPublicText } from './skill-content-normalizer';

export interface SkillSearchInput {
  query?: string;
  activeEnvironment?: string;
  activeProfile?: string;
  includeQuarantined?: boolean;
  risk?: SkillRisk;
  skills: SkillDefinition[];
  agents: AgentDefinition[];
}

export interface SkillSearchResult {
  name: string;
  kind: 'skill' | 'agent';
  score: number;
  reason: string;
  description: string;
  risk?: string;
  environments: string[];
  profiles: string[];
  aliases: string[];
}

@Injectable()
export class SkillSearchService {
  search(input: SkillSearchInput): SkillSearchResult[] {
    const query = normalize(input.query ?? '');
    const activeEnvironment = input.activeEnvironment ? normalize(input.activeEnvironment) : '';
    const activeProfile = input.activeProfile ? normalize(input.activeProfile) : '';
    const results: SkillSearchResult[] = [];

    for (const agent of input.agents) {
      const result = this.scoreAgent(agent, query, activeEnvironment, activeProfile);
      if (result.score > 0) {
        results.push(result);
      }
    }

    for (const skill of input.skills) {
      if (!input.includeQuarantined && (skill.isActive === false || skill.trust === 'quarantined' || skill.risk === 'critical')) {
        continue;
      }
      if (input.risk && skill.risk !== input.risk) {
        continue;
      }
      const result = this.scoreSkill(skill, query, activeEnvironment, activeProfile);
      if (result.score > 0) {
        results.push(result);
      }
    }

    return results
      .sort((a, b) => b.score - a.score || kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name))
      .slice(0, 25);
  }

  private scoreSkill(
    skill: SkillDefinition,
    query: string,
    activeEnvironment: string,
    activeProfile: string,
  ): SkillSearchResult {
    const aliases = skill.aliases ?? [];
    const environments = skill.environments ?? [];
    const profiles = skill.profiles ?? [];
    const name = normalizeSkillPublicText(skill.name);
    const description = normalizeSkillPublicText(skill.description);
    const publicAliases = aliases.map((alias) => normalizeSkillPublicText(alias));
    const score = this.scoreText({
      query,
      activeEnvironment,
      activeProfile,
      name,
      description,
      aliases: publicAliases,
      environments,
      profiles,
      kindBoost: 0,
    });

    return {
      name,
      kind: 'skill',
      score: score.value,
      reason: score.reasons.join(', '),
      description,
      risk: skill.risk,
      environments,
      profiles,
      aliases: publicAliases,
    };
  }

  private scoreAgent(
    agent: AgentDefinition,
    query: string,
    activeEnvironment: string,
    activeProfile: string,
  ): SkillSearchResult {
    const environments = agent.environments ?? [];
    const profiles = agent.profiles ?? [];
    const score = this.scoreText({
      query,
      activeEnvironment,
      activeProfile,
      name: agent.name,
      description: agent.description,
      aliases: [],
      environments,
      profiles,
      kindBoost: 25,
    });

    return {
      name: agent.name,
      kind: 'agent',
      score: score.value,
      reason: score.reasons.join(', '),
      description: agent.description,
      environments,
      profiles,
      aliases: [],
    };
  }

  private scoreText(input: {
    query: string;
    activeEnvironment: string;
    activeProfile: string;
    name: string;
    description: string;
    aliases: string[];
    environments: string[];
    profiles: string[];
    kindBoost: number;
  }): { value: number; reasons: string[] } {
    let value = input.query ? 0 : 10;
    const reasons: string[] = [];
    const name = normalize(input.name);
    const description = normalize(input.description);
    const aliases = input.aliases.map(normalize);
    const environments = input.environments.map(normalize);
    const profiles = input.profiles.map(normalize);

    if (input.activeProfile && profiles.includes(input.activeProfile)) {
      value += 120;
      reasons.push('active profile');
    }
    if (input.activeEnvironment && environments.includes(input.activeEnvironment)) {
      value += 80;
      reasons.push('active environment');
    }
    if (input.query) {
      if (name === input.query) {
        value += 70;
        reasons.push('exact name');
      } else if (aliases.includes(input.query)) {
        value += 65;
        reasons.push('alias match');
      } else if (name.startsWith(input.query)) {
        value += 45;
        reasons.push('name prefix');
      } else if (aliases.some((alias) => alias.startsWith(input.query))) {
        value += 40;
        reasons.push('alias prefix');
      } else if (name.includes(input.query) || description.includes(input.query)) {
        value += 20;
        reasons.push('text match');
      }
    }

    if (value > 0) {
      value += input.kindBoost;
    }
    if (reasons.length === 0 && value > 0) {
      reasons.push('available');
    }
    return { value, reasons };
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function kindRank(kind: 'skill' | 'agent'): number {
  return kind === 'agent' ? 0 : 1;
}
