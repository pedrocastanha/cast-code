import { Injectable, OnModuleInit } from '@nestjs/common';
import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { SkillFrontmatter, SkillDefinition } from '../types';
import * as path from 'path';

@Injectable()
export class SkillLoaderService implements OnModuleInit {
  private skills: Map<string, SkillDefinition> = new Map();
  private definitionsPath: string;
  private activeEnvironmentId: string | null = null;
  private activeEnvironmentSkills: Set<string> | null = null;

  constructor(private readonly markdownParser: MarkdownParserService) {
    this.definitionsPath = path.join(__dirname, '..', 'definitions');
  }

  async onModuleInit() {
    await this.loadSkills();
  }

  async loadSkills() {
    const exists = await this.markdownParser.exists(this.definitionsPath);

    if (!exists) {
      return;
    }

    const parsed = await this.markdownParser.parseAll<SkillFrontmatter>(this.definitionsPath);

    for (const [relativePath, { frontmatter, content }] of parsed) {
      const shortName = frontmatter.name || relativePath.split('/').pop() || relativePath;
      const skillDef: SkillDefinition = {
        name: shortName,
        description: frontmatter.description || '',
        tools: frontmatter.tools || [],
        ...this.readGovernanceMetadata(frontmatter),
        guidelines: content,
      };

      this.skills.set(relativePath, skillDef);
      if (shortName !== relativePath) {
        this.skills.set(shortName, skillDef);
      }
    }
  }

  async loadFromPath(customPath: string) {
    const exists = await this.markdownParser.exists(customPath);

    if (!exists) {
      return;
    }

    const parsed = await this.markdownParser.parseAll<SkillFrontmatter>(customPath);

    for (const [name, { frontmatter, content }] of parsed) {
      this.skills.set(name, {
        name: frontmatter.name || name,
        description: frontmatter.description || '',
        tools: frontmatter.tools || [],
        ...this.readGovernanceMetadata(frontmatter),
        guidelines: content,
        source: frontmatter.source || 'local',
      });
    }
  }

  loadRemoteSkills(skills: SkillDefinition[]): string[] {
    const overridden: string[] = [];

    for (const skill of skills) {
      if (this.skills.has(skill.name)) {
        overridden.push(skill.name);
      }
      this.skills.set(skill.name, {
        ...skill,
        source: skill.source || 'remote',
      });
    }

    return overridden;
  }

  getSkill(name: string): SkillDefinition | undefined {
    const skill = this.skills.get(name);
    if (!skill || !this.isSkillInActiveScope(skill)) {
      return undefined;
    }
    return skill;
  }

  getAllSkills(): SkillDefinition[] {
    const unique = new Map<string, SkillDefinition>();
    for (const skill of this.skills.values()) {
      if (this.isSkillInActiveScope(skill)) {
        unique.set(skill.name, skill);
      }
    }
    return Array.from(unique.values());
  }

  getAllUnscopedSkills(): SkillDefinition[] {
    const unique = new Map<string, SkillDefinition>();
    for (const skill of this.skills.values()) {
      unique.set(skill.name, skill);
    }
    return Array.from(unique.values());
  }

  getSkillNames(): string[] {
    return Array.from(this.skills.entries())
      .filter(([, skill]) => this.isSkillInActiveScope(skill))
      .map(([name]) => name);
  }

  getUnscopedSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }

  setActiveEnvironmentScope(environmentId: string, skillNames: string[]): void {
    this.activeEnvironmentId = environmentId;
    this.activeEnvironmentSkills = new Set(skillNames);
  }

  clearActiveEnvironmentScope(): void {
    this.activeEnvironmentId = null;
    this.activeEnvironmentSkills = null;
  }

  private isSkillInActiveScope(skill: SkillDefinition): boolean {
    if (skill.isActive === false) {
      return false;
    }

    if (!this.activeEnvironmentId || !this.activeEnvironmentSkills) {
      return true;
    }
    return this.activeEnvironmentSkills.has(skill.name)
      || Boolean(skill.environments?.includes(this.activeEnvironmentId));
  }

  private readGovernanceMetadata(frontmatter: SkillFrontmatter): Pick<
    SkillDefinition,
    'source' | 'sourceRepo' | 'sourcePath' | 'trust' | 'risk' | 'tags' | 'environments' | 'scannerFindings' | 'isActive'
  > {
    return {
      source: frontmatter.source,
      sourceRepo: frontmatter.sourceRepo,
      sourcePath: frontmatter.sourcePath,
      trust: frontmatter.trust,
      risk: frontmatter.risk,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      environments: Array.isArray(frontmatter.environments) ? frontmatter.environments : [],
      scannerFindings: Array.isArray(frontmatter.scannerFindings) ? frontmatter.scannerFindings : [],
      isActive: typeof frontmatter.isActive === 'boolean' ? frontmatter.isActive : undefined,
    };
  }
}
