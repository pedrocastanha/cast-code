import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { SkillFrontmatter, SkillDefinition } from '../types';
import * as path from 'path';
import { collectSkillSupportFiles, packagePathsForSkill } from './skill-asset-utils';
import { normalizeSkillContentForCast, normalizeSkillPublicText } from './skill-content-normalizer';
import { LoadedSkillMetadataIndex, SkillMetadataEntry, SkillMetadataIndexService } from './skill-metadata-index.service';

const VALID_METADATA_ENVIRONMENTS = [
  'backend',
  'design',
  'devops',
  'engineering',
  'frontend',
  'marketing',
  'qa',
  'security',
];

@Injectable()
export class SkillLoaderService implements OnModuleInit {
  private skills: Map<string, SkillDefinition> = new Map();
  private definitionsPath: string;
  private activeEnvironmentId: string | null = null;
  private activeEnvironmentSkills: Set<string> | null = null;
  private activeEnvironmentScopeStrict = false;

  constructor(
    private readonly markdownParser: MarkdownParserService,
    @Optional()
    private readonly metadataIndexService?: SkillMetadataIndexService,
  ) {
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
    const metadataIndex = await this.loadMetadataIndex(parsed);

    for (const [relativePath, { frontmatter, content }] of parsed) {
      if (!this.isSkillDefinitionFile(relativePath)) {
        continue;
      }

      const sourceName = frontmatter.name || this.nameFromRelativePath(relativePath);
      const publicName = this.normalizePublicSkillName(sourceName);
      const packageMetadata = await this.readPackageMetadata(this.definitionsPath, relativePath);
      const governanceMetadata = this.readGovernanceMetadata(frontmatter, relativePath);
      const skillDef: SkillDefinition = {
        name: publicName,
        description: normalizeSkillPublicText(frontmatter.description || ''),
        tools: frontmatter.tools || [],
        ...packageMetadata,
        ...governanceMetadata,
        guidelines: normalizeSkillContentForCast(content),
      };
      this.applyIndexedMetadata(skillDef, metadataIndex.findForSkillOrSource(sourceName, governanceMetadata.sourcePath));
      this.normalizePublicMetadata(skillDef);

      this.skills.set(relativePath, skillDef);
      if (publicName !== relativePath) {
        this.skills.set(publicName, skillDef);
      }
      if (sourceName !== publicName) {
        this.skills.set(sourceName, skillDef);
      }
      for (const alias of skillDef.aliases ?? []) {
        this.skills.set(alias, skillDef);
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
      const packageMetadata = await this.readPackageMetadata(customPath, name);
      const sourceName = frontmatter.name || name;
      const skillDef: SkillDefinition = {
        name: this.normalizePublicSkillName(sourceName),
        description: normalizeSkillPublicText(frontmatter.description || ''),
        tools: frontmatter.tools || [],
        ...packageMetadata,
        ...this.readGovernanceMetadata(frontmatter, name),
        guidelines: normalizeSkillContentForCast(content),
        source: this.normalizeSource(frontmatter.source) || 'local',
      };
      this.normalizePublicMetadata(skillDef);
      this.skills.set(name, skillDef);
      this.skills.set(skillDef.name, skillDef);
      for (const alias of skillDef.aliases ?? []) {
        this.skills.set(alias, skillDef);
      }
    }
  }

  loadRemoteSkills(skills: SkillDefinition[]): string[] {
    const overridden: string[] = [];

    for (const skill of skills) {
      if (this.skills.has(skill.name)) {
        overridden.push(skill.name);
      }
      const skillDef: SkillDefinition = {
        ...skill,
        name: this.normalizePublicSkillName(skill.name),
        description: normalizeSkillPublicText(skill.description || ''),
        guidelines: normalizeSkillContentForCast(skill.guidelines),
        source: skill.source || 'remote',
        supportFiles: skill.supportFiles || [],
      };
      this.normalizePublicMetadata(skillDef);
      this.skills.set(skill.name, skillDef);
      this.skills.set(skillDef.name, skillDef);
      for (const alias of skillDef.aliases ?? []) {
        this.skills.set(alias, skillDef);
      }
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

  getUnscopedSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
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
    const names = new Set<string>();
    for (const [key, skill] of this.skills.entries()) {
      if (!this.isSkillInActiveScope(skill)) {
        continue;
      }
      names.add(skill.name);
      if (this.isPublicSkillKey(key)) {
        names.add(key);
      }
    }
    return Array.from(names);
  }

  getUnscopedSkillNames(): string[] {
    const names = new Set<string>();
    for (const [key, skill] of this.skills.entries()) {
      names.add(skill.name);
      if (this.isPublicSkillKey(key)) {
        names.add(key);
      }
    }
    return Array.from(names);
  }

  setActiveEnvironmentScope(
    environmentId: string,
    skillNames: string[],
    options: { strict?: boolean } = {},
  ): void {
    this.activeEnvironmentId = environmentId;
    this.activeEnvironmentSkills = new Set(skillNames);
    this.activeEnvironmentScopeStrict = options.strict ?? false;
  }

  clearActiveEnvironmentScope(): void {
    this.activeEnvironmentId = null;
    this.activeEnvironmentSkills = null;
    this.activeEnvironmentScopeStrict = false;
  }

  private isSkillInActiveScope(skill: SkillDefinition): boolean {
    if (skill.isActive === false) {
      return false;
    }

    if (!this.activeEnvironmentId || !this.activeEnvironmentSkills) {
      return true;
    }
    if (this.activeEnvironmentScopeStrict) {
      return this.activeEnvironmentSkills.has(skill.name);
    }
    return this.activeEnvironmentSkills.has(skill.name)
      || Boolean(skill.environments?.includes(this.activeEnvironmentId));
  }

  private async readPackageMetadata(
    definitionsPath: string,
    relativePath: string,
  ): Promise<Pick<SkillDefinition, 'definitionPath' | 'packageRoot' | 'supportFiles'>> {
    const metadata = packagePathsForSkill(definitionsPath, relativePath);
    if (!metadata.packageRoot) {
      return metadata;
    }

    try {
      return {
        ...metadata,
        supportFiles: await collectSkillSupportFiles(metadata.packageRoot),
      };
    } catch {
      return metadata;
    }
  }

  private async loadMetadataIndex(
    parsed: Map<string, { frontmatter: SkillFrontmatter; content: string }>,
  ): Promise<LoadedSkillMetadataIndex> {
    const knownSkillNames: string[] = [];
    const knownSourcePaths: string[] = [];

    for (const [relativePath, { frontmatter }] of parsed) {
      if (!this.isSkillDefinitionFile(relativePath)) {
        continue;
      }
      knownSkillNames.push(frontmatter.name || this.nameFromRelativePath(relativePath));
      if (this.isBundledSkillPackage(relativePath)) {
        knownSourcePaths.push(this.bundledSourcePath(relativePath));
      } else if (frontmatter.sourcePath) {
        knownSourcePaths.push(frontmatter.sourcePath);
      }
    }

    if (!this.metadataIndexService) {
      return new LoadedSkillMetadataIndex([]);
    }

    return this.metadataIndexService.loadFromFile(path.join(this.definitionsPath, 'skill-metadata.cast-skill-index.yaml'), {
      knownSkillNames,
      knownSourcePaths,
      validEnvironments: VALID_METADATA_ENVIRONMENTS,
    });
  }

  private applyIndexedMetadata(skill: SkillDefinition, metadata?: SkillMetadataEntry): void {
    if (!metadata) {
      return;
    }

    if (metadata.sourcePath) skill.sourcePath = metadata.sourcePath;
    if (metadata.aliases.length > 0) skill.aliases = metadata.aliases;
    if (metadata.category) skill.category = metadata.category;
    if (metadata.environments) skill.environments = metadata.environments;
    if (metadata.profiles) skill.profiles = metadata.profiles;
    if (metadata.risk) skill.risk = metadata.risk;
    if (metadata.trust) skill.trust = metadata.trust;
    if (metadata.activationPolicy) skill.activationPolicy = metadata.activationPolicy;
    if (typeof metadata.isActive === 'boolean') skill.isActive = metadata.isActive;
  }

  private normalizePublicMetadata(skill: SkillDefinition): void {
    skill.name = this.normalizePublicSkillName(skill.name);
    skill.description = normalizeSkillPublicText(skill.description || '');
    skill.aliases = this.normalizePublicStringList(skill.aliases);
    skill.tags = this.normalizePublicStringList(skill.tags);
  }

  private normalizePublicSkillName(value: string): string {
    return normalizeSkillPublicText(value).trim();
  }

  private normalizePublicStringList(values?: string[]): string[] | undefined {
    if (!values) {
      return undefined;
    }
    const normalized = values
      .map((value) => normalizeSkillPublicText(String(value)).trim())
      .filter(Boolean);
    return Array.from(new Set(normalized));
  }

  private isPublicSkillKey(value: string): boolean {
    return normalizeSkillPublicText(value) === value;
  }

  private readGovernanceMetadata(frontmatter: SkillFrontmatter, relativePath?: string): Pick<
    SkillDefinition,
    'source' | 'sourceRepo' | 'sourcePath' | 'trust' | 'risk' | 'tags' | 'environments' | 'scannerFindings' | 'isActive'
  > {
    if (relativePath && this.isBundledSkillPackage(relativePath)) {
      return this.readBundledSkillMetadata(frontmatter, relativePath);
    }

    return {
      source: this.normalizeSource(frontmatter.source),
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
    if (normalized.startsWith('catalog/')) {
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

  private isBundledSkillPackage(relativePath: string): boolean {
    const normalized = this.normalizePath(relativePath);
    return (normalized.startsWith('catalog/skills/') || normalized.startsWith('catalog/optional-skills/'))
      && normalized.endsWith('/SKILL');
  }

  private readBundledSkillMetadata(frontmatter: SkillFrontmatter, relativePath: string): Pick<
    SkillDefinition,
    'source' | 'sourceRepo' | 'sourcePath' | 'trust' | 'risk' | 'tags' | 'environments' | 'scannerFindings' | 'isActive'
  > {
    const sourcePath = this.bundledSourcePath(relativePath);
    const tags = this.readTags(frontmatter);
    const risk = this.inferBundledRisk(sourcePath, tags);

    return {
      source: 'builtin',
      sourcePath,
      trust: risk === 'critical' ? 'quarantined' : 'community',
      risk,
      tags,
      environments: this.inferBundledEnvironments(sourcePath, frontmatter, tags),
      scannerFindings: risk === 'critical'
        ? [{
          category: 'system_override',
          severity: 'critical',
          message: 'Skill is quarantined by default because it teaches jailbreak or safety-bypass behavior.',
        }]
        : [],
      isActive: risk === 'critical' ? false : undefined,
    };
  }

  private bundledSourcePath(relativePath: string): string {
    const normalized = this.normalizePath(relativePath);
    return `${normalized.replace(/^catalog\//, '').replace(/\/SKILL$/, '/SKILL.md')}`;
  }

  private inferBundledRisk(sourcePath: string, tags: string[]): SkillDefinition['risk'] {
    const text = `${sourcePath} ${tags.join(' ')}`.toLowerCase();
    if (text.includes('jailbreak') || text.includes('safety-bypass') || sourcePath.startsWith('skills/red-teaming/')) {
      return 'critical';
    }
    return 'low';
  }

  private inferBundledEnvironments(sourcePath: string, frontmatter: SkillFrontmatter, tags: string[]): string[] {
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

    const metadata = (frontmatter as SkillFrontmatter & { metadata?: Record<string, { tags?: unknown }> }).metadata;
    const castTags = metadata?.cast?.tags;
    return Array.isArray(castTags) ? castTags.map(String) : [];
  }

  private normalizeSource(source?: string): SkillDefinition['source'] | undefined {
    return source as SkillDefinition['source'] | undefined;
  }

  private normalizePath(value: string): string {
    return value.split(path.sep).join('/');
  }
}
