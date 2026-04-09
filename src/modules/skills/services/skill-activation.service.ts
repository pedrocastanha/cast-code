import { Injectable } from '@nestjs/common';
import { SkillLoaderService } from './skill-loader.service';
import { SkillDefinition } from '../types';

export interface SkillMatch {
  skill: SkillDefinition;
  score: number;
  reason: string;
}

export interface ActivationContext {
  message: string;
  recentFiles?: string[];
  projectRoot?: string;
}

@Injectable()
export class SkillActivationService {
  private readonly KEYWORD_WEIGHTS: Record<string, number> = {
    exact_match: 1.0,
    partial_match: 0.6,
    related_term: 0.3,
  };

  private readonly FILE_PATTERN_WEIGHTS: Record<string, number> = {
    exact_dir: 1.0,
    glob_match: 0.8,
    ext_match: 0.5,
  };

  private readonly AUTO_ACTIVATE_THRESHOLD = 0.5;

  constructor(private readonly skillLoader: SkillLoaderService) {}

  activateSkills(context: ActivationContext): SkillMatch[] {
    const allSkills = this.skillLoader.getAllSkills();
    const scored: SkillMatch[] = [];

    for (const skill of allSkills) {
      const score = this.scoreSkill(skill, context);
      if (score.score >= this.AUTO_ACTIVATE_THRESHOLD) {
        scored.push(score);
      }
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  private scoreSkill(skill: SkillDefinition, context: ActivationContext): SkillMatch {
    const keywordScore = this.scoreKeywords(skill, context.message);
    const fileScore = this.scoreFilePatterns(skill, context.recentFiles || []);
    const intentScore = this.scoreIntent(skill, context.message);

    const totalScore = Math.min(1.0, (keywordScore.score * 0.5) + (fileScore.score * 0.3) + (intentScore.score * 0.2));

    const reasons = [keywordScore.reason, fileScore.reason, intentScore.reason]
      .filter((r) => r.length > 0);

    return {
      skill,
      score: totalScore,
      reason: reasons.join('; '),
    };
  }

  private scoreKeywords(skill: SkillDefinition, message: string): { score: number; reason: string } {
    const lowerMessage = message.toLowerCase();
    const skillName = skill.name.toLowerCase();
    const skillDesc = skill.description.toLowerCase();

    const words = lowerMessage.split(/\s+/).filter((w) => w.length > 2);
    const keywords = this.extractKeywords(skill);

    let bestScore = 0;
    let bestReason = '';

    if (words.some((w) => skillName.includes(w)) || skillName.includes(lowerMessage)) {
      bestScore = this.KEYWORD_WEIGHTS.exact_match;
      bestReason = `name match: "${skill.name}"`;
    }

    for (const kw of keywords) {
      if (lowerMessage.includes(kw)) {
        const score = this.KEYWORD_WEIGHTS.partial_match;
        if (score > bestScore) {
          bestScore = score;
          bestReason = `keyword: "${kw}"`;
        }
      }
    }

    if (skillDesc && words.some((w) => skillDesc.includes(w))) {
      const score = this.KEYWORD_WEIGHTS.related_term;
      if (score > bestScore) {
        bestScore = score;
        bestReason = 'description match';
      }
    }

    return { score: bestScore, reason: bestReason };
  }

  private scoreFilePatterns(skill: SkillDefinition, files: string[]): { score: number; reason: string } {
    if (files.length === 0) return { score: 0, reason: '' };

    const patterns = this.extractFilePatterns(skill);
    if (patterns.length === 0) return { score: 0, reason: '' };

    let matchCount = 0;

    for (const file of files) {
      for (const pattern of patterns) {
        if (this.fileMatchesPattern(file, pattern)) {
          matchCount++;
        }
      }
    }

    const ratio = matchCount / (files.length * Math.max(1, patterns.length));
    const score = Math.min(1.0, ratio * 3);

    if (matchCount > 0) {
      return { score, reason: `${matchCount} file(s) match skill patterns` };
    }

    return { score: 0, reason: '' };
  }

  private fileMatchesPattern(file: string, pattern: string): boolean {
    const lowerFile = file.toLowerCase();

    if (pattern.includes('*')) {
      const regex = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(regex).test(lowerFile);
    }

    if (pattern.startsWith('.')) {
      return lowerFile.endsWith(pattern.toLowerCase());
    }

    return lowerFile.includes(pattern.toLowerCase());
  }

  private scoreIntent(skill: SkillDefinition, message: string): { score: number; reason: string } {
    const lowerMessage = message.toLowerCase();
    const intents = this.extractIntents(skill);

    for (const intent of intents) {
      if (lowerMessage.includes(intent.toLowerCase())) {
        return { score: 0.7, reason: `intent: "${intent}"` };
      }
    }

    return { score: 0, reason: '' };
  }

  private extractKeywords(skill: SkillDefinition): string[] {
    const keywords: string[] = [];
    const name = skill.name.toLowerCase();

    if (name.includes('react')) keywords.push('react', 'jsx', 'component', 'hook', 'useState', 'useEffect', 'tsx');
    if (name.includes('database')) keywords.push('database', 'db', 'sql', 'query', 'migration', 'orm');
    if (name.includes('api')) keywords.push('api', 'rest', 'graphql', 'endpoint', 'route', 'controller');
    if (name.includes('test')) keywords.push('test', 'spec', 'jest', 'vitest', 'unit', 'integration', 'e2e');
    if (name.includes('git')) keywords.push('git', 'commit', 'branch', 'merge', 'push', 'pull');
    if (name.includes('search')) keywords.push('search', 'find', 'grep', 'glob', 'locate');
    if (name.includes('file')) keywords.push('file', 'read', 'write', 'edit', 'create');
    if (name.includes('planning')) keywords.push('plan', 'design', 'architect', 'break down', 'steps');
    if (name.includes('bootstrap')) keywords.push('bootstrap', 'tailwind', 'styling', 'css', 'theme');

    return keywords;
  }

  private extractFilePatterns(skill: SkillDefinition): string[] {
    const patterns: string[] = [];
    const name = skill.name.toLowerCase();

    if (name.includes('react')) patterns.push('*.tsx', '*.jsx', 'src/components/', 'src/hooks/');
    if (name.includes('database')) patterns.push('*.sql', '*entity*', '*model*', '*repository*', '*migration*');
    if (name.includes('api')) patterns.push('*controller*', '*route*', '*handler*', '*middleware*');
    if (name.includes('test')) patterns.push('*.test.*', '*.spec.*', '__tests__/', 'tests/');
    if (name.includes('bootstrap')) patterns.push('*.css', '*.scss', '*.sass', 'styles/', 'public/');

    return patterns;
  }

  private extractIntents(skill: SkillDefinition): string[] {
    const intents: string[] = [];
    const name = skill.name.toLowerCase();

    if (name.includes('react')) intents.push('create component', 'build ui', 'react component');
    if (name.includes('database')) intents.push('create table', 'database design', 'schema');
    if (name.includes('api')) intents.push('create api', 'endpoint', 'route handler');
    if (name.includes('test')) intents.push('write test', 'test coverage', 'unit test');
    if (name.includes('planning')) intents.push('plan', 'how to', 'approach');

    return intents;
  }
}
