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

    const parsed = await this.markdownParser.parseAll<SkillFrontmatter>(
      this.definitionsPath,
      '**/*.md',
      (relativePath) => this.isSkillDefinitionFile(relativePath),
    );

    for (const [relativePath, { frontmatter, content }] of parsed) {
      if (!this.isSkillDefinitionFile(relativePath)) {
        continue;
      }

      const shortName = frontmatter.name || this.nameFromRelativePath(relativePath);
      const skillDef: SkillDefinition = {
        name: shortName,
        description: frontmatter.description || '',
        tools: frontmatter.tools || [],
        ...this.readGovernanceMetadata(frontmatter, relativePath),
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
        ...this.readGovernanceMetadata(frontmatter, name),
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

  private readGovernanceMetadata(frontmatter: SkillFrontmatter, relativePath?: string): Pick<
    SkillDefinition,
    'source' | 'sourceRepo' | 'sourcePath' | 'trust' | 'risk' | 'tags' | 'environments' | 'scannerFindings' | 'isActive'
  > {
    if (relativePath && this.isHermesBundledSkill(relativePath)) {
      return this.readHermesBundledMetadata(frontmatter, relativePath);
    }

    return {
      source: frontmatter.source,
      sourceRepo: frontmatter.sourceRepo,
      sourcePath: frontmatter.sourcePath,
      trust: frontmatter.trust,
      risk: frontmatter.risk,
      tags: this.readTags(frontmatter),
      environments: Array.isArray(frontmatter.environments) ? frontmatter.environments : [],
      scannerFindings: Array.isArray(frontmatter.scannerFindings) ? frontmatter.scannerFindings : [],
      isActive: typeof frontmatter.isActive === 'boolean' ? frontmatter.isActive : undefined,
    };
  }

  private isSkillDefinitionFile(relativePath: string): boolean {
    const normalized = this.normalizePath(relativePath);
    if (normalized.startsWith('hermes/')) {
      return normalized.endsWith('/SKILL') || normalized === 'SKILL';
    }
    return true;
  }

  private nameFromRelativePath(relativePath: string): string {
    const normalized = this.normalizePath(relativePath);
    const parts = normalized.split('/');
    const last = parts[parts.length - 1];
    if (last === 'SKILL' && parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return last || normalized;
  }

  private isHermesBundledSkill(relativePath: string): boolean {
    const normalized = this.normalizePath(relativePath);
    return (normalized.startsWith('hermes/skills/') || normalized.startsWith('hermes/optional-skills/'))
      && normalized.endsWith('/SKILL');
  }

  private readHermesBundledMetadata(frontmatter: SkillFrontmatter, relativePath: string): Pick<
    SkillDefinition,
    'source' | 'sourceRepo' | 'sourcePath' | 'trust' | 'risk' | 'tags' | 'environments' | 'scannerFindings' | 'isActive'
  > {
    const sourcePath = this.hermesSourcePath(relativePath);
    const tags = this.readTags(frontmatter);
    const risk = this.hermesRisk(sourcePath, tags);

    return {
      source: 'hermes-bundled',
      sourceRepo: 'nousresearch/hermes-agent',
      sourcePath,
      trust: risk === 'critical' ? 'quarantined' : 'community',
      risk,
      tags,
      environments: this.hermesEnvironments(sourcePath, frontmatter, tags),
      scannerFindings: risk === 'critical'
        ? [{
          category: 'system_override',
          severity: 'critical',
          message: 'Bundled Hermes skill is quarantined by default because it teaches jailbreak or safety-bypass behavior.',
        }]
        : [],
      isActive: risk === 'critical' ? false : undefined,
    };
  }

  private hermesSourcePath(relativePath: string): string {
    const normalized = this.normalizePath(relativePath);
    return `${normalized.replace(/^hermes\//, '').replace(/\/SKILL$/, '/SKILL.md')}`;
  }

  private hermesRisk(sourcePath: string, tags: string[]): SkillDefinition['risk'] {
    const text = `${sourcePath} ${tags.join(' ')}`.toLowerCase();
    if (text.includes('jailbreak') || text.includes('safety-bypass') || sourcePath.startsWith('skills/red-teaming/')) {
      return 'critical';
    }
    return 'low';
  }

  private hermesEnvironments(sourcePath: string, frontmatter: SkillFrontmatter, tags: string[]): string[] {
    const text = [
      sourcePath,
      frontmatter.name,
      frontmatter.description,
      tags.join(' '),
    ].join(' ').toLowerCase();
    const environments = new Set<string>();

    const add = (...ids: string[]) => ids.forEach((id) => environments.add(id));
    if (sourcePath.startsWith('skills/red-teaming/') || sourcePath.startsWith('optional-skills/security/')) {
      add('security');
      return Array.from(environments);
    }
    if (sourcePath.startsWith('skills/devops/') || sourcePath.startsWith('optional-skills/devops/')) {
      add('devops', 'engineering');
      return Array.from(environments);
    }

    if (sourcePath.startsWith('skills/software-development/')
      || sourcePath.startsWith('optional-skills/software-development/')
      || sourcePath.startsWith('skills/github/')
      || sourcePath.startsWith('skills/autonomous-ai-agents/')
      || sourcePath.startsWith('optional-skills/autonomous-ai-agents/')) {
      add('engineering');
    }
    if (/\b(devops|docker|deploy|deployment|webhook|kanban|worker|cron)\b/.test(text)) {
      add('devops', 'engineering');
    }
    if (/\b(rest|graphql|api|server|backend|database|sql)\b/.test(text)) {
      add('backend', 'engineering');
    }
    if (/\b(frontend|react|web-development|html|css|ui|page|browser)\b/.test(text)) {
      add('frontend', 'design');
    }
    if (/\b(test|testing|tdd|quality|debugging|review)\b/.test(text)) {
      add('qa', 'engineering');
    }
    if (sourcePath.startsWith('skills/creative/') || sourcePath.startsWith('optional-skills/creative/') || sourcePath.startsWith('skills/media/') || /\b(design|figma|visual|creative|video|image|diagram)\b/.test(text)) {
      add('design', 'marketing');
    }
    if (sourcePath.startsWith('skills/research/') || sourcePath.startsWith('optional-skills/research/') || /\b(research|paper|arxiv|analysis)\b/.test(text)) {
      add('research', 'engineering');
    }
    if (sourcePath.startsWith('skills/productivity/') || sourcePath.startsWith('optional-skills/productivity/') || sourcePath.startsWith('skills/email/') || sourcePath.startsWith('optional-skills/email/') || sourcePath.startsWith('skills/note-taking/')) {
      add('support', 'marketing');
    }
    if (sourcePath.startsWith('skills/mlops/') || sourcePath.startsWith('optional-skills/mlops/') || sourcePath.startsWith('skills/data-science/') || /\b(mlops|model|jupyter|data-science)\b/.test(text)) {
      add('data', 'engineering');
    }
    if (/\b(security|auth|jailbreak|forensics)\b/.test(text)) {
      add('security');
    }

    if (environments.size === 0) {
      add('engineering');
    }

    return Array.from(environments);
  }

  private readTags(frontmatter: SkillFrontmatter): string[] {
    if (Array.isArray(frontmatter.tags)) {
      return frontmatter.tags.map(String);
    }

    const metadata = (frontmatter as SkillFrontmatter & { metadata?: { hermes?: { tags?: unknown } } }).metadata;
    const hermesTags = metadata?.hermes?.tags;
    return Array.isArray(hermesTags) ? hermesTags.map(String) : [];
  }

  private normalizePath(value: string): string {
    return value.split(path.sep).join('/');
  }
}
