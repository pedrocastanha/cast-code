import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MultiLlmService } from '../../../common/services/multi-llm.service';
import { MonorepoDetectorService } from './monorepo-detector.service';

import { I18nService } from '../../i18n/services/i18n.service';
import { GitDiffInfo, SplitCommit, CommitGroup, ConventionalCommitType } from '../types/git.types';
import {
  commitSystemPrompt,
  splitSystemPrompt,
  refineSystemPrompt,
  buildCommitHumanPrompt,
  buildSplitHumanPrompt,
  buildGroupHumanPrompt,
  buildRefineHumanPrompt,
} from './commit-prompts';

const COMMIT_TYPES: ConventionalCommitType[] = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
];

const COMMIT_TYPE_SET = new Set<string>(COMMIT_TYPES);

const COMMIT_TYPE_ALIASES: Record<string, ConventionalCommitType> = {
  feature: 'feat',
  features: 'feat',
  bug: 'fix',
  bugfix: 'fix',
  documentation: 'docs',
  docs: 'docs',
  test: 'test',
  tests: 'test',
  testing: 'test',
  performance: 'perf',
  optimize: 'perf',
  optimization: 'perf',
  dependency: 'build',
  dependencies: 'build',
  maintenance: 'chore',
  housekeeping: 'chore',
  cleanup: 'chore',
  remove: 'refactor',
};

const LEADING_VERB_TRANSLATIONS: Record<string, string> = {
  add: 'adiciona',
  adds: 'adiciona',
  update: 'atualiza',
  updates: 'atualiza',
  upgrade: 'atualiza',
  upgrades: 'atualiza',
  fix: 'corrige',
  fixes: 'corrige',
  remove: 'remove',
  removes: 'remove',
  refactor: 'refatora',
  refactors: 'refatora',
  improve: 'melhora',
  improves: 'melhora',
  create: 'cria',
  creates: 'cria',
  implement: 'implementa',
  implements: 'implementa',
  rename: 'renomeia',
  renames: 'renomeia',
};

@Injectable()
export class CommitGeneratorService {
  constructor(
    private readonly multiLlmService: MultiLlmService,
    private readonly monorepoDetector: MonorepoDetectorService,
    private readonly i18nService: I18nService,
  ) {}

  private lang(): string {
    return this.i18nService.getLanguage();
  }

  getDiffInfo(): GitDiffInfo | null {
    try {
      const cwd = process.cwd();
      const staged = execSync('git diff --cached --unified=1 --no-ext-diff', { cwd, encoding: 'utf-8' });
      const unstaged = execSync('git diff --unified=1 --no-ext-diff', { cwd, encoding: 'utf-8' });
      const stagedStats = execSync('git diff --cached --stat', { cwd, encoding: 'utf-8' });
      const unstagedStats = execSync('git diff --stat', { cwd, encoding: 'utf-8' });
      const statusShort = execSync('git status --short', { cwd, encoding: 'utf-8' });
      const untrackedRaw = execSync('git ls-files --others --exclude-standard', { cwd, encoding: 'utf-8' });
      const untrackedFiles = untrackedRaw.trim() ? untrackedRaw.trim().split('\n').filter(f => f.trim()) : [];

      return {
        staged,
        unstaged,
        stagedFiles: this.extractFiles(staged),
        unstagedFiles: this.extractFiles(unstaged),
        untrackedFiles,
        stats: this.buildStatsSummary(stagedStats, unstagedStats, statusShort, untrackedFiles),
      };
    } catch {
      return null;
    }
  }

  hasChanges(): boolean {
    try {
      const output = execSync('git status --porcelain', { cwd: process.cwd(), encoding: 'utf-8' });
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  async generateCommitMessage(): Promise<string | null> {
    const diffInfo = this.getDiffInfo();
    if (!diffInfo) return null;

    const monorepoInfo = this.monorepoDetector.detectMonorepo(process.cwd());
    const allFiles = [...diffInfo.stagedFiles, ...diffInfo.unstagedFiles, ...diffInfo.untrackedFiles];
    const scope = this.monorepoDetector.determineScope(allFiles, monorepoInfo);

    const llm = this.multiLlmService.createModel('cheap');
    const prompt = this.buildCommitPrompt(diffInfo, scope);

    const response = await llm.invoke([
      new SystemMessage(commitSystemPrompt(this.lang())),
      new HumanMessage(prompt),
    ]);

    const message = this.extractContent(response.content);
    return this.normalizeCommitMessage(message, 'chore', scope);
  }

  async splitCommits(): Promise<SplitCommit[] | null> {
    const diffInfo = this.getDiffInfo();
    if (!diffInfo) return null;

    const monorepoInfo = this.monorepoDetector.detectMonorepo(process.cwd());
    const allFiles = [...diffInfo.stagedFiles, ...diffInfo.unstagedFiles, ...diffInfo.untrackedFiles];

    const llm = this.multiLlmService.createModel('cheap');
    const splitPrompt = this.buildSplitPrompt(diffInfo, allFiles);

    const splitResponse = await llm.invoke([
      new SystemMessage(splitSystemPrompt(this.lang())),
      new HumanMessage(splitPrompt),
    ]);

    const splitContent = this.extractContent(splitResponse.content);
    const commitGroups = this.parseCommitGroups(splitContent);
    if (!commitGroups?.length) return null;

    const normalizedGroups = this.normalizeCommitGroups(commitGroups, allFiles);
    if (normalizedGroups.length === 0) return null;

    for (const group of normalizedGroups) {
      if (!group.scope) {
        group.scope = this.monorepoDetector.determineScope(group.files, monorepoInfo);
      }
    }

    const splitCommits: SplitCommit[] = [];
    for (const group of normalizedGroups) {
      const message = await this.generateMessageForGroup(group);
      splitCommits.push({ ...group, message });
    }

    return splitCommits;
  }

  executeCommit(message: string, autoStage = true): boolean {
    try {
      const cwd = process.cwd();
      if (autoStage) {
        execSync('git add -A', { cwd });
      }
      execSync('git commit -F -', { cwd, input: `${message}\n`, encoding: 'utf-8' });
      return true;
    } catch {
      return false;
    }
  }

  executePush(): { success: boolean; error?: string } {
    try {
      const cwd = process.cwd();
      const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim();
      execSync(`git push origin ${branch}`, { cwd, encoding: 'utf-8' });
      return { success: true };
    } catch (error: any) {
      const message = error.message || 'Push failed';
      if (message.includes('rejected') || message.includes('diverged')) {
        return { success: false, error: 'Push rejected. Run "git pull --rebase" first.' };
      }
      return { success: false, error: message };
    }
  }

  executeSplitCommits(commits: SplitCommit[]): { success: boolean; committed: number; error?: string; originalHead?: string } {
    const cwd = process.cwd();
    let committedCount = 0;
    let originalHead: string | undefined;

    try {
      originalHead = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();

      for (const commit of commits) {
        execSync('git reset', { cwd });

        for (const file of this.normalizeFiles(commit.files)) {
          try {
            execSync(`git add -- ${this.escapeShellArg(file)}`, { cwd });
          } catch {}
        }

        const staged = execSync('git diff --cached --name-only', { cwd, encoding: 'utf-8' });
        if (!staged.trim()) continue;

        execSync('git commit -F -', { cwd, input: `${commit.message}\n`, encoding: 'utf-8' });
        committedCount++;
      }

      return { success: true, committed: committedCount };
    } catch (error: any) {
      return {
        success: false,
        committed: committedCount,
        error: error.message || 'Failed to execute commits',
        originalHead
      };
    }
  }

  async refineCommitMessage(
    currentMessage: string,
    userSuggestion: string,
    diffInfo: GitDiffInfo,
  ): Promise<string> {
    const llm = this.multiLlmService.createModel('cheap');
    const context = this.buildDiffContext(diffInfo, {
      maxLength: 6000,
      maxCharsPerFile: 1200,
      maxUntrackedFiles: 3,
      maxUntrackedLines: 40,
    });
    const currentMetadata = this.extractTypeAndScope(currentMessage);
    const prompt = buildRefineHumanPrompt(this.lang(), currentMessage, userSuggestion, context);

    const response = await llm.invoke([
      new SystemMessage(refineSystemPrompt(this.lang())),
      new HumanMessage(prompt),
    ]);

    const message = this.extractContent(response.content);
    return this.normalizeCommitMessage(
      message,
      currentMetadata.type ?? 'chore',
      currentMetadata.scope,
      'update code',
      currentMetadata.breaking ?? false,
    );
  }

  private extractFiles(diff: string): string[] {
    const files = new Set<string>();
    const lines = diff.split('\n');

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/diff --git a\/(.+?) b\/(.+?)$/);
        if (match) {
          files.add(match[2]);
        }
      }
    }

    return Array.from(files);
  }

  private extractContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (typeof first === 'object' && first !== null && 'text' in first) {
        return String(first.text);
      }
    }
    return String(content);
  }

  private buildCommitPrompt(diffInfo: GitDiffInfo, scope?: string): string {
    const lang = this.lang();
    const scopeHint = scope
      ? (lang === 'en' ? `Likely monorepo scope: "${scope}".` : `Escopo provável do monorepo: "${scope}".`)
      : (lang === 'en' ? 'Monorepo scope not automatically identified.' : 'Escopo do monorepo não identificado automaticamente.');
    const fullDiff = this.buildDiffContext(diffInfo, {
      maxLength: 12000,
      maxCharsPerFile: 1800,
      maxUntrackedFiles: 4,
      maxUntrackedLines: 60,
    });
    return buildCommitHumanPrompt(lang, scopeHint, fullDiff);
  }

  private buildSplitPrompt(diffInfo: GitDiffInfo, files: string[]): string {
    const allFiles = this.normalizeFiles([...files, ...diffInfo.untrackedFiles]);
    const fullDiff = this.buildDiffContext(diffInfo, {
      maxLength: 15000,
      maxCharsPerFile: 1600,
      maxUntrackedFiles: 6,
      maxUntrackedLines: 80,
    });
    const lang = this.lang();
    const filesList = allFiles.join(', ') || (lang === 'en' ? '(no files detected)' : '(nenhum arquivo detectado)');
    return buildSplitHumanPrompt(lang, filesList, fullDiff);
  }

  private async generateMessageForGroup(group: CommitGroup): Promise<string> {
    const llm = this.multiLlmService.createModel('cheap');
    const scopePart = group.scope ? `(${group.scope})` : '';
    const prompt = buildGroupHumanPrompt(this.lang(), group.type, scopePart, group.files, group.description);

    const response = await llm.invoke([
      new SystemMessage(commitSystemPrompt(this.lang())),
      new HumanMessage(prompt),
    ]);

    const message = this.extractContent(response.content);
    return this.normalizeCommitMessage(message, group.type, group.scope, group.description);
  }

  private parseCommitGroups(content: string): CommitGroup[] | null {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.commits && Array.isArray(parsed.commits)) {
          return parsed.commits;
        }
      } catch {}
    }

    try {
      const parsed = JSON.parse(content);
      if (parsed.commits && Array.isArray(parsed.commits)) {
        return parsed.commits;
      }
    } catch {}

    return null;
  }

  private normalizeCommitGroups(commitGroups: CommitGroup[], files: string[]): CommitGroup[] {
    const expectedFiles = new Set(this.normalizeFiles(files));
    const usedFiles = new Set<string>();
    const normalizedGroups: CommitGroup[] = [];

    for (const group of commitGroups) {
      const filesFromGroup = this.normalizeFiles(Array.isArray(group.files) ? group.files : [])
        .filter((file) => expectedFiles.has(file))
        .filter((file) => {
          if (usedFiles.has(file)) {
            return false;
          }
          usedFiles.add(file);
          return true;
        });

      if (filesFromGroup.length === 0) continue;

      normalizedGroups.push({
        type: this.normalizeCommitType(group.type, this.inferTypeFromFiles(filesFromGroup)),
        files: filesFromGroup,
        description: this.normalizeDescription(group.description, this.lang() === 'en' ? 'organize related changes' : 'organiza mudanças relacionadas'),
        scope: this.normalizeScope(group.scope),
      });
    }

    const missingFiles = this.normalizeFiles(files).filter((file) => !usedFiles.has(file));
    if (missingFiles.length > 0) {
      normalizedGroups.push({
        type: this.inferTypeFromFiles(missingFiles),
        files: missingFiles,
        description: this.lang() === 'en' ? 'organize remaining diff files' : 'organiza arquivos restantes do diff',
      });
    }

    return normalizedGroups;
  }

  private normalizeCommitMessage(
    rawMessage: string,
    fallbackType: ConventionalCommitType,
    fallbackScope?: string,
    fallbackDescription?: string,
    fallbackBreaking = false,
  ): string {
    const candidateLine = this.extractCandidateCommitLine(rawMessage);
    const match = candidateLine.match(/^([a-zA-Z-]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);

    const type = this.normalizeCommitType(match?.[1], fallbackType);
    const scope = this.normalizeScope(match?.[2] ?? fallbackScope);
    const breaking = Boolean(match?.[3]) || fallbackBreaking;
    const rawDescription = match?.[4] ?? candidateLine;
    const defaultFallback = this.lang() === 'en' ? 'update code' : 'atualiza código';
    const description = this.normalizeDescription(rawDescription, fallbackDescription ?? defaultFallback);

    const breakingFlag = breaking ? '!' : '';
    const prefix = scope
      ? `${type}(${scope})${breakingFlag}: `
      : `${type}${breakingFlag}: `;
    const maxDescriptionLength = Math.max(12, 100 - prefix.length);
    const truncatedDescription = this.truncateText(description, maxDescriptionLength);

    return `${prefix}${truncatedDescription}`;
  }

  private extractTypeAndScope(message: string): {
    type?: ConventionalCommitType;
    scope?: string;
    breaking?: boolean;
  } {
    const candidateLine = this.extractCandidateCommitLine(message);
    const match = candidateLine.match(/^([a-zA-Z-]+)(?:\(([^)]+)\))?(!)?:\s*.+$/);
    if (!match) return {};

    return {
      type: this.normalizeCommitType(match[1], 'chore'),
      scope: this.normalizeScope(match[2]),
      breaking: Boolean(match[3]),
    };
  }

  private extractCandidateCommitLine(rawMessage: string): string {
    const withoutCodeBlock = rawMessage.replace(/```(?:[\w-]+)?/g, '');
    const lines = withoutCodeBlock
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^[-*]\s+/, ''));

    if (lines.length === 0) return '';

    const conventionalLine = lines.find((line) => /^[a-zA-Z-]+(?:\([^)]+\))?!?:\s+/.test(line));
    if (conventionalLine) {
      return conventionalLine.replace(/^["'`]|["'`]$/g, '').trim();
    }

    const prefixedLine = lines.find((line) => /^commit\s*:/i.test(line));
    if (prefixedLine) {
      return prefixedLine.replace(/^commit\s*:/i, '').replace(/^["'`]|["'`]$/g, '').trim();
    }

    return lines[0].replace(/^["'`]|["'`]$/g, '').trim();
  }

  private normalizeCommitType(
    type: string | undefined,
    fallbackType: ConventionalCommitType,
  ): ConventionalCommitType {
    const normalized = (type || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z]/g, '');

    if (!normalized) return fallbackType;
    if (COMMIT_TYPE_SET.has(normalized)) return normalized as ConventionalCommitType;
    if (COMMIT_TYPE_ALIASES[normalized]) return COMMIT_TYPE_ALIASES[normalized];

    return fallbackType;
  }

  private normalizeScope(scope?: string): string | undefined {
    if (!scope) return undefined;

    const normalized = scope
      .trim()
      .replace(/^["'`]|["'`]$/g, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9/_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized || undefined;
  }

  private normalizeDescription(description: string, fallback: string): string {
    let normalized = description
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/^([a-zA-Z-]+)(?:\([^)]+\))?!?:\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();

    normalized = normalized.replace(/[.;:!?]+$/, '').trim();
    if (!normalized) normalized = fallback;

    if (this.lang() !== 'en') {
      normalized = this.translateLeadingVerb(normalized);
    }

    if (/^[A-ZÀ-Ý]/.test(normalized)) {
      normalized = normalized.charAt(0).toLowerCase() + normalized.slice(1);
    }

    return normalized;
  }

  private translateLeadingVerb(description: string): string {
    const match = description.match(/^([a-zA-Z]+)(\b.*)$/);
    if (!match) return description;

    const translated = LEADING_VERB_TRANSLATIONS[match[1].toLowerCase()];
    if (!translated) return description;

    return `${translated}${match[2]}`;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.slice(0, maxLength - 1).trimEnd();
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) {
      return truncated.slice(0, lastSpace).trimEnd() + '…';
    }

    return truncated + '…';
  }

  private normalizeFiles(files: string[]): string[] {
    const unique = new Set<string>();

    for (const file of files) {
      if (typeof file !== 'string') continue;
      const normalized = file.trim().replace(/^["']|["']$/g, '');
      if (!normalized) continue;
      unique.add(normalized);
    }

    return Array.from(unique);
  }

  private buildStatsSummary(
    stagedStats: string,
    unstagedStats: string,
    statusShort: string,
    untrackedFiles: string[],
  ): string {
    const sections: string[] = [];

    if (statusShort.trim()) {
      sections.push(`Git status (--short):\n${statusShort.trim()}`);
    }
    if (stagedStats.trim()) {
      sections.push(`Diff staged (--cached --stat):\n${stagedStats.trim()}`);
    }
    if (unstagedStats.trim()) {
      sections.push(`Diff unstaged (--stat):\n${unstagedStats.trim()}`);
    }
    if (untrackedFiles.length > 0) {
      sections.push(`Arquivos novos (${untrackedFiles.length}): ${untrackedFiles.join(', ')}`);
    }

    return sections.join('\n\n');
  }

  private buildDiffContext(
    diffInfo: GitDiffInfo,
    options: {
      maxLength: number;
      maxCharsPerFile: number;
      maxUntrackedFiles: number;
      maxUntrackedLines: number;
    },
  ): string {
    const sections: string[] = [];

    if (diffInfo.stats.trim()) {
      sections.push(`Resumo:\n${diffInfo.stats.trim()}`);
    }

    sections.push(this.buildFilesSummary(diffInfo));

    const stagedByFile = this.limitDiffByFile(diffInfo.staged, options.maxCharsPerFile);
    if (stagedByFile) {
      sections.push(`=== STAGED ===\n${stagedByFile}`);
    }

    const unstagedByFile = this.limitDiffByFile(diffInfo.unstaged, options.maxCharsPerFile);
    if (unstagedByFile) {
      sections.push(`=== UNSTAGED ===\n${unstagedByFile}`);
    }

    const untrackedPreview = this.buildUntrackedPreview(
      diffInfo.untrackedFiles,
      options.maxUntrackedFiles,
      options.maxUntrackedLines,
    );
    if (untrackedPreview) {
      sections.push(`=== PREVIEW ARQUIVOS NOVOS ===\n${untrackedPreview}`);
    }

    let combined = sections.filter(Boolean).join('\n\n');
    if (combined.length > options.maxLength) {
      combined = `${combined.slice(0, options.maxLength).trimEnd()}\n\n... (contexto truncado)`;
    }

    return combined;
  }

  private buildFilesSummary(diffInfo: GitDiffInfo): string {
    const lines: string[] = [];

    const stagedFiles = this.normalizeFiles(diffInfo.stagedFiles);
    const unstagedFiles = this.normalizeFiles(diffInfo.unstagedFiles);
    const untrackedFiles = this.normalizeFiles(diffInfo.untrackedFiles);

    if (stagedFiles.length > 0) {
      lines.push(`Staged (${stagedFiles.length}): ${this.summarizeFileList(stagedFiles)}`);
    }
    if (unstagedFiles.length > 0) {
      lines.push(`Unstaged (${unstagedFiles.length}): ${this.summarizeFileList(unstagedFiles)}`);
    }
    if (untrackedFiles.length > 0) {
      lines.push(`Novos (${untrackedFiles.length}): ${this.summarizeFileList(untrackedFiles)}`);
    }

    if (lines.length === 0) {
      return 'Arquivos afetados: nenhum arquivo identificado';
    }

    return `Arquivos afetados:\n${lines.join('\n')}`;
  }

  private summarizeFileList(files: string[], limit = 20): string {
    if (files.length <= limit) {
      return files.join(', ');
    }

    const remaining = files.length - limit;
    return `${files.slice(0, limit).join(', ')}, ... (+${remaining})`;
  }

  private limitDiffByFile(diff: string, maxCharsPerFile: number): string {
    if (!diff.trim()) return '';

    const sections = this.splitDiffByFile(diff);
    if (sections.length === 0) return '';

    const limitedSections = sections.map((section) => {
      if (section.length <= maxCharsPerFile) return section.trimEnd();
      return `${section.slice(0, maxCharsPerFile).trimEnd()}\n... (diff deste arquivo truncado)`;
    });

    return limitedSections.join('\n\n');
  }

  private splitDiffByFile(diff: string): string[] {
    const rawSections = diff
      .split(/^diff --git /m)
      .map((section) => section.trim())
      .filter((section) => section.length > 0);

    return rawSections.map((section) => `diff --git ${section}`);
  }

  private buildUntrackedPreview(files: string[], maxFiles: number, maxLines: number): string {
    const selectedFiles = this.normalizeFiles(files).slice(0, maxFiles);
    const sections: string[] = [];

    for (const file of selectedFiles) {
      const preview = this.readTextFilePreview(file, maxLines);
      if (!preview) continue;
      sections.push(`--- ${file} ---\n${preview}`);
    }

    if (files.length > maxFiles) {
      sections.push(`... ${files.length - maxFiles} arquivo(s) novo(s) omitido(s)`);
    }

    return sections.join('\n\n');
  }

  private readTextFilePreview(file: string, maxLines: number): string {
    try {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('\u0000')) {
        return '[arquivo binário omitido]';
      }

      if (!content.length) {
        return '[arquivo vazio]';
      }

      const lines = content.split('\n');
      const preview = lines.slice(0, maxLines).join('\n');
      const clippedPreview = preview.length > 2500 ? `${preview.slice(0, 2500)}\n...` : preview;

      if (lines.length > maxLines && !clippedPreview.endsWith('\n...')) {
        return `${clippedPreview}\n...`;
      }

      return clippedPreview;
    } catch {
      return '';
    }
  }

  private inferTypeFromFiles(files: string[]): ConventionalCommitType {
    if (files.length === 0) return 'chore';

    const onlyDocs = files.every((file) =>
      /^docs\//i.test(file)
      || /(^|\/)README\.md$/i.test(file)
      || /(^|\/)CHANGELOG\.md$/i.test(file)
      || /\.(md|mdx|txt)$/i.test(file),
    );
    if (onlyDocs) return 'docs';

    const onlyTests = files.every((file) =>
      /(^|\/)__tests__\//.test(file)
      || /\.(spec|test)\.[cm]?[jt]sx?$/.test(file),
    );
    if (onlyTests) return 'test';

    const onlyInfra = files.every((file) =>
      /(^|\/)package(-lock)?\.json$/.test(file)
      || /(^|\/)(pnpm-lock\.yaml|yarn\.lock)$/i.test(file)
      || /(^|\/)Dockerfile/i.test(file)
      || /(^|\/)docker-compose\.ya?ml$/i.test(file)
      || /(^|\/)\.github\/workflows\//.test(file),
    );
    if (onlyInfra) return 'build';

    return 'chore';
  }

  private escapeShellArg(value: string): string {
    return `'${value.replace(/'/g, '\'\\\'\'')}'`;
  }
}
