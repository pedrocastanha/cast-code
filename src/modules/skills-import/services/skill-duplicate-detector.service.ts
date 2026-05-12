import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  DiscoveredHermesSkill,
  ExistingSkillForDuplicateDetection,
  SkillDuplicateReport,
} from '../types/skills-import.types';

@Injectable()
export class SkillDuplicateDetectorService {
  detect(skill: Pick<DiscoveredHermesSkill, 'name' | 'description' | 'body'>, existing: ExistingSkillForDuplicateDetection[]): SkillDuplicateReport {
    const duplicateName = existing.find((candidate) => candidate.name.toLowerCase() === skill.name.toLowerCase());
    if (duplicateName) {
      return { status: 'duplicateName', matches: [{ name: duplicateName.name, status: 'duplicateName' }] };
    }

    const skillFingerprint = this.fingerprint(this.combinedText(skill));
    const duplicateContent = existing.find((candidate) => this.fingerprint(this.combinedText(candidate)) === skillFingerprint);
    if (duplicateContent) {
      return { status: 'duplicateContent', matches: [{ name: duplicateContent.name, status: 'duplicateContent' }] };
    }

    const similar = existing
      .map((candidate) => ({
        name: candidate.name,
        status: 'similar' as const,
        score: this.similarity(this.combinedText(skill), this.combinedText(candidate)),
      }))
      .filter((candidate) => candidate.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (similar.length > 0) {
      return { status: 'similar', matches: similar.slice(0, 3) };
    }

    return { status: 'none', matches: [] };
  }

  private combinedText(input: { description: string; body?: string; guidelines?: string }): string {
    return `${input.description}\n${input.body || input.guidelines || ''}`;
  }

  private fingerprint(text: string): string {
    return createHash('sha256').update(this.normalize(text)).digest('hex');
  }

  private normalize(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private similarity(left: string, right: string): number {
    const leftTokens = new Set(this.normalize(left).split(' ').filter((token) => token.length > 2));
    const rightTokens = new Set(this.normalize(right).split(' ').filter((token) => token.length > 2));
    const union = new Set([...leftTokens, ...rightTokens]);
    if (union.size === 0) {
      return 0;
    }

    let intersection = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        intersection += 1;
      }
    }

    return intersection / union.size;
  }
}
