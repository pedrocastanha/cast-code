import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../../common/services/llm.service';
import { MonorepoDetectorService } from './monorepo-detector.service';
import { GitDiffInfo, SplitCommit, CommitGroup, MonorepoInfo } from '../types/git.types';

@Injectable()
export class CommitGeneratorService {
  constructor(
    private readonly llmService: LlmService,
    private readonly monorepoDetector: MonorepoDetectorService,
  ) {}

  getDiffInfo(): GitDiffInfo | null {
    try {
      const cwd = process.cwd();
      const staged = execSync('git diff --cached', { cwd, encoding: 'utf-8' });
      const unstaged = execSync('git diff', { cwd, encoding: 'utf-8' });
      const stats = execSync('git diff --stat', { cwd, encoding: 'utf-8' });

      return {
        staged,
        unstaged,
        stagedFiles: this.extractFiles(staged),
        unstagedFiles: this.extractFiles(unstaged),
        stats,
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
    const allFiles = [...diffInfo.stagedFiles, ...diffInfo.unstagedFiles];
    const scope = this.monorepoDetector.determineScope(allFiles, monorepoInfo);

    const llm = this.llmService.createModel();
    const prompt = this.buildCommitPrompt(diffInfo, scope);

    const response = await llm.invoke([
      new SystemMessage(this.getCommitSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    const message = this.extractContent(response.content);
    return this.cleanCommitMessage(message);
  }

  async splitCommits(): Promise<SplitCommit[] | null> {
    const diffInfo = this.getDiffInfo();
    if (!diffInfo) return null;

    const monorepoInfo = this.monorepoDetector.detectMonorepo(process.cwd());
    const allFiles = [...diffInfo.stagedFiles, ...diffInfo.unstagedFiles];

    const llm = this.llmService.createModel();
    const splitPrompt = this.buildSplitPrompt(diffInfo, allFiles);

    const splitResponse = await llm.invoke([
      new SystemMessage(this.getSplitSystemPrompt()),
      new HumanMessage(splitPrompt),
    ]);

    const splitContent = this.extractContent(splitResponse.content);
    const commitGroups = this.parseCommitGroups(splitContent);

    if (!commitGroups?.length) return null;

    for (const group of commitGroups) {
      if (!group.scope) {
        group.scope = this.monorepoDetector.determineScope(group.files, monorepoInfo);
      }
    }

    const splitCommits: SplitCommit[] = [];
    for (const group of commitGroups) {
      const message = await this.generateMessageForGroup(group, diffInfo);
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
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });
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

  executeSplitCommits(commits: SplitCommit[]): { success: boolean; committed: number; error?: string } {
    try {
      const cwd = process.cwd();
      let committedCount = 0;

      for (const commit of commits) {
        execSync('git reset', { cwd });

        for (const file of commit.files) {
          try {
            execSync(`git add "${file}"`, { cwd });
          } catch {
          }
        }

        const staged = execSync('git diff --cached --name-only', { cwd, encoding: 'utf-8' });
        if (!staged.trim()) continue;

        execSync(`git commit -m "${commit.message.replace(/"/g, '\\"')}"`, { cwd });
        committedCount++;
      }

      return { success: true, committed: committedCount };
    } catch (error: any) {
      return { success: false, committed: 0, error: error.message || 'Failed to execute commits' };
    }
  }

  async refineCommitMessage(
    currentMessage: string,
    userSuggestion: string,
    diffInfo: GitDiffInfo,
  ): Promise<string> {
    const llm = this.llmService.createModel();

    const prompt = `Current commit message: ${currentMessage}\n\nUser suggestion: ${userSuggestion}\n\nDiff:\n${diffInfo.staged.slice(0, 3000)}`;

    const response = await llm.invoke([
      new SystemMessage(this.getRefineSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    const message = this.extractContent(response.content);
    return this.cleanCommitMessage(message);
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

  private cleanCommitMessage(message: string): string {
    return message
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\n/g, ' ')
      .trim();
  }

  private buildCommitPrompt(diffInfo: GitDiffInfo, scope?: string): string {
    const scopeHint = scope ? `\n\nThis is a monorepo. The changes are primarily in the "${scope}" module.` : '';

    let fullDiff = '';
    if (diffInfo.staged) {
      fullDiff += `=== Staged changes ===\n${diffInfo.staged}\n\n`;
    }
    if (diffInfo.unstaged) {
      fullDiff += `=== Unstaged changes ===\n${diffInfo.unstaged}\n\n`;
    }

    const maxLength = 10000;
    if (fullDiff.length > maxLength) {
      fullDiff = fullDiff.slice(0, maxLength) + '\n\n... (truncated)';
    }

    return `Generate a conventional commit message for the following changes.${scopeHint}\n\nFiles changed:\n${diffInfo.stats}\n\n${fullDiff}`;
  }

  private buildSplitPrompt(diffInfo: GitDiffInfo, files: string[]): string {
    let fullDiff = '';
    if (diffInfo.staged) {
      fullDiff += `=== Staged changes ===\n${diffInfo.staged}\n\n`;
    }
    if (diffInfo.unstaged) {
      fullDiff += `=== Unstaged changes ===\n${diffInfo.unstaged}\n\n`;
    }

    const maxLength = 8000;
    if (fullDiff.length > maxLength) {
      fullDiff = fullDiff.slice(0, maxLength) + '\n\n... (truncated)';
    }

    return `Analyze all the files below and group them into logical commits.\n\nFiles: ${files.join(', ')}\n\nStats:\n${diffInfo.stats}\n\n${fullDiff}`;
  }

  private async generateMessageForGroup(group: CommitGroup, diffInfo: GitDiffInfo): Promise<string> {
    const llm = this.llmService.createModel();

    const scopePart = group.scope ? `(${group.scope})` : '';

    const prompt = `Generate a conventional commit message (max 72 chars) for:\n\nType: ${group.type}${scopePart}\nFiles: ${group.files.join(', ')}\nDescription: ${group.description}\n\nIMPORTANT: Return ONLY the commit message in format: "type(scope): description" or "type: description"\nThe message MUST be in English.`;

    const response = await llm.invoke([
      new SystemMessage(this.getCommitSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    let message = this.extractContent(response.content);
    message = this.cleanCommitMessage(message);

    if (!message.includes(':')) {
      const scope = group.scope ? `(${group.scope})` : '';
      message = `${group.type}${scope}: ${message}`;
    }

    return message;
  }

  private parseCommitGroups(content: string): CommitGroup[] | null {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.commits && Array.isArray(parsed.commits)) {
          return parsed.commits;
        }
      } catch {
        // Continue to try other formats
      }
    }

    try {
      const parsed = JSON.parse(content);
      if (parsed.commits && Array.isArray(parsed.commits)) {
        return parsed.commits;
      }
    } catch {
      // Continue
    }

    return null;
  }

  private getCommitSystemPrompt(): string {
    return `You are a Git commit message expert. Generate concise commit messages following Conventional Commits.

**Available types:**
- feat: new feature
- fix: bug fix
- docs: documentation
- style: formatting (no logic change)
- refactor: refactoring (no functionality change)
- perf: performance improvement
- test: tests
- build: build/dependencies
- ci: continuous integration
- chore: general tasks
- cleanup: code cleanup
- remove: code removal

**Format:**
- With scope: <type>(<scope>): <description>
- Without scope: <type>: <description>

**Rules:**
- Maximum 72 characters for the subject line
- Description in English
- No period at the end
- Use imperative mood ("add" not "added")
- Be specific but concise

If this is a monorepo and you can identify the module, include the scope.

Return ONLY the commit message, nothing else.`;
  }

  private getSplitSystemPrompt(): string {
    return `You are a Git commit organization expert. Analyze the changes and divide them into logical commits.

**YOUR TASK:**
Group changes into logical commits based on:
1. **Functional cohesion**: Changes that make sense together
2. **Change type**: features, fixes, docs, refactorings separated
3. **Related files**: Files that work together

**RETURN FORMAT (JSON):**
Return ONLY valid JSON in this format:
\`\`\`json
{
  "commits": [
    {
      "type": "feat",
      "files": ["src/auth.ts", "src/models/user.ts"],
      "description": "add user authentication"
    },
    {
      "type": "docs",
      "files": ["README.md"],
      "description": "update documentation"
    }
  ]
}
\`\`\`

**AVAILABLE TYPES:**
feat, fix, docs, style, refactor, perf, test, build, ci, chore

**RULES:**
- Each commit should have a clear purpose
- Group functionally related files
- Separate features from fixes from documentation
- Maximum 5 files per commit (ideally fewer)
- If diff is small (<3 files), can be 1 commit only
- Description must ALWAYS be in English
- Include ALL files in the result

**IMPORTANT:** Return ONLY the JSON, no additional text.`;
  }

  private getRefineSystemPrompt(): string {
    return `You are refining a commit message based on user feedback.

**Instructions:**
- Keep the message concise (max 72 characters)
- Follow Conventional Commits format
- Incorporate the user's suggestion
- Return ONLY the new commit message, without explanations
- Message MUST be in English`;
  }
}
