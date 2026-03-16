import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MultiLlmService } from '../../../common/services/multi-llm.service';
import { MonorepoDetectorService } from './monorepo-detector.service';
import { PromptLoaderService } from '../../core/services/prompt-loader.service';

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: string[];
  diff: string;
}

export interface PRDescription {
  title: string;
  description: string;
  commits: { hash: string; summary: string; details: string }[];
}

export interface PRCreationResult {
  success: boolean;
  url?: string;
  error?: string;
  description?: string;
  platform: 'github' | 'azure' | 'gitlab' | 'bitbucket' | 'unknown';
}

@Injectable()
export class PrGeneratorService {
  private prTemplateCache?: string;
  private readonly prTemplatePath = '/home/pedro-castanheira/Downloads/pull-request.template.md';

  constructor(
    private readonly multiLlmService: MultiLlmService,
    private readonly monorepoDetector: MonorepoDetectorService,
    private readonly promptLoader: PromptLoaderService,
  ) {}

  getCurrentBranch(): string {
    try {
      return execSync('git branch --show-current', { 
        cwd: process.cwd(), 
        encoding: 'utf-8' 
      }).trim();
    } catch {
      return 'unknown';
    }
  }

  detectDefaultBaseBranch(): string {
    try {
      const cwd = process.cwd();
      const candidates = ['main', 'master', 'develop'];
      
      for (const branch of candidates) {
        try {
          execSync(`git rev-parse --verify ${branch} 2>/dev/null || git rev-parse --verify origin/${branch} 2>/dev/null`, { 
            cwd, 
            stdio: 'ignore' 
          });
          return branch;
        } catch {
        }
      }
      
      return 'main';
    } catch {
      return 'main';
    }
  }

  detectPlatform(): { platform: 'github' | 'azure' | 'gitlab' | 'bitbucket' | 'unknown'; url: string } {
    try {
      const remoteUrl = execSync('git remote get-url origin', { 
        cwd: process.cwd(), 
        encoding: 'utf-8' 
      }).trim();

      if (remoteUrl.includes('github.com')) {
        return { platform: 'github', url: remoteUrl };
      }
      if (remoteUrl.includes('dev.azure.com') || remoteUrl.includes('visualstudio.com')) {
        return { platform: 'azure', url: remoteUrl };
      }
      if (remoteUrl.includes('gitlab.com') || remoteUrl.includes('gitlab')) {
        return { platform: 'gitlab', url: remoteUrl };
      }
      if (remoteUrl.includes('bitbucket.org')) {
        return { platform: 'bitbucket', url: remoteUrl };
      }

      return { platform: 'unknown', url: remoteUrl };
    } catch {
      return { platform: 'unknown', url: '' };
    }
  }

  getCommitsNotInBase(baseBranch: string = 'develop'): CommitInfo[] {
    try {
      const cwd = process.cwd();
      
      try {
        execSync(`git rev-parse --verify ${baseBranch}`, { cwd, stdio: 'ignore' });
      } catch {
        try {
          execSync(`git rev-parse --verify origin/${baseBranch}`, { cwd, stdio: 'ignore' });
        } catch {
          return [];
        }
      }

      const logOutput = execSync(
        `git log ${baseBranch}..HEAD --pretty=format:"%H|%s|%an|%ad" --date=short`,
        { cwd, encoding: 'utf-8' }
      );

      if (!logOutput.trim()) {
        return [];
      }

      const commits: CommitInfo[] = [];
      const lines = logOutput.trim().split('\n');

      for (const line of lines) {
        const [hash, message, author, date] = line.split('|');
        if (!hash) continue;

        const filesOutput = execSync(
          `git diff-tree --no-commit-id --name-only -r ${hash}`,
          { cwd, encoding: 'utf-8' }
        );
        const files = filesOutput.trim().split('\n').filter(f => f);

        const diffOutput = execSync(
          `git show ${hash} --stat`,
          { cwd, encoding: 'utf-8' }
        );

        commits.push({
          hash: hash.slice(0, 7),
          message,
          author,
          date,
          files,
          diff: diffOutput,
        });
      }

      return commits.reverse();
    } catch (error) {
      return [];
    }
  }

  async analyzeCommit(commit: CommitInfo): Promise<{ summary: string; details: string }> {
    const llm = this.multiLlmService.createModel('cheap');

    const prompt = this.buildCommitAnalysisPrompt(commit);

    const response = await llm.invoke([
      new SystemMessage(this.getCommitAnalysisSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    const content = this.extractContent(response.content);
    return this.parseCommitAnalysis(content);
  }

  async generatePRDescription(
    branchName: string, 
    commits: CommitInfo[],
    baseBranch: string = 'develop',
  ): Promise<PRDescription> {
    const llm = this.multiLlmService.createModel('cheap');
    const prompt = this.buildSinglePrompt(branchName, commits, baseBranch);

    const response = await llm.invoke([
      new SystemMessage(this.getSingleAgentSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    const content = this.extractContent(response.content);
    const { title, description, commitSummaries } = this.parseSingleResponse(content, commits);

    return {
      title: title || this.generateDefaultTitle(branchName),
      description: description && description.trim().length > 0 ? description : this.getPRTemplate(),
      commits: commitSummaries,
    };
  }

  async createPR(
    title: string, 
    description: string, 
    baseBranch: string = 'develop'
  ): Promise<PRCreationResult> {
    const { platform } = this.detectPlatform();
    const branch = this.getCurrentBranch();

    if (platform !== 'github') {
      return {
        success: false,
        error: `Automatic PR creation not supported for ${platform}. Description generated and copied to clipboard.`,
        description: this.formatPRForClipboard(title, description, baseBranch),
        platform,
      };
    }

    try {
      execSync('which gh', { cwd: process.cwd() });
    } catch {
      return {
        success: false,
        error: 'GitHub CLI (gh) not found. Install from https://cli.github.com/',
        description: this.formatPRForClipboard(title, description, baseBranch),
        platform,
      };
    }

    try {
      const cwd = process.cwd();

      const tempFile = `/tmp/pr-body-${Date.now()}.md`;
      require('fs').writeFileSync(tempFile, description);

      try {
        const result = execSync(
          `gh pr create --title "${title.replace(/"/g, '\\"')}" --body-file "${tempFile}" --base "${baseBranch}"`,
          { cwd, encoding: 'utf-8' }
        );
        
        const urlMatch = result.match(/https:\/\/github\.com\/[^\s]+/);
        
        return { 
          success: true, 
          url: urlMatch ? urlMatch[0] : undefined,
          platform,
        };
      } finally {
        try {
          require('fs').unlinkSync(tempFile);
        } catch {}
      }
    } catch (error: any) {
      const message = error.message || 'Failed to create PR';
      if (message.includes('already exists')) {
        return { 
          success: false, 
          error: 'A PR already exists for this branch',
          description: this.formatPRForClipboard(title, description, baseBranch),
          platform,
        };
      }
      return { 
        success: false, 
        error: message,
        description: this.formatPRForClipboard(title, description, baseBranch),
        platform,
      };
    }
  }

  copyToClipboard(text: string): boolean {
    try {
      const platform = process.platform;
      
      if (platform === 'darwin') {
        execSync(`echo ${JSON.stringify(text)} | pbcopy`);
        return true;
      } else if (platform === 'linux') {
        try {
          execSync(`echo ${JSON.stringify(text)} | xclip -selection clipboard`);
          return true;
        } catch {
          try {
            execSync(`echo ${JSON.stringify(text)} | xsel --clipboard --input`);
            return true;
          } catch {
            return false;
          }
        }
      } else if (platform === 'win32') {
        execSync(`echo ${JSON.stringify(text)} | clip`);
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  formatPRForClipboard(title: string, description: string, baseBranch: string): string {
    return description;
  }

  getPRCreateUrl(platform: string, baseBranch: string): string | null {
    try {
      const remoteUrl = execSync('git remote get-url origin', { 
        cwd: process.cwd(), 
        encoding: 'utf-8' 
      }).trim();

      const branch = this.getCurrentBranch();

      let httpsUrl = remoteUrl
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/^git@gitlab\.com:/, 'https://gitlab.com/')
        .replace(/^git@bitbucket\.org:/, 'https://bitbucket.org/')
        .replace(/\.git$/, '');

      switch (platform) {
        case 'github':
          return `${httpsUrl}/compare/${baseBranch}...${branch}?expand=1`;
        case 'gitlab':
          return `${httpsUrl}/merge_requests/new?merge_request[source_branch]=${branch}&merge_request[target_branch]=${baseBranch}`;
        case 'bitbucket':
          return `${httpsUrl}/pull-requests/new?source=${branch}&dest=${baseBranch}`;
        case 'azure':
          return null;
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private buildCommitAnalysisPrompt(commit: CommitInfo): string {
    const monorepoInfo = this.monorepoDetector.detectMonorepo(process.cwd());
    const scope = this.monorepoDetector.determineScope(commit.files, monorepoInfo);

    return `Analyze this commit:\n\n**Commit:** ${commit.hash}\n**Message:** ${commit.message}\n**Author:** ${commit.author}\n**Date:** ${commit.date}\n**Scope:** ${scope || 'general'}\n\n**Files Changed:**\n${commit.files.join('\n')}\n\n**Diff Stats:**\n${commit.diff}\n\nProvide:\n1. A one-line summary (max 100 chars)\n2. Detailed explanation of changes, approach, and impact`;
  }

  private getCommitAnalysisSystemPrompt(): string {
    return `Analyze a git commit. Provide:\n\n1. **Summary**: One sentence (max 100 chars)\n2. **Details**: Detailed paragraph about changes\n\nFormat:\nSUMMARY: <summary>\n\nDETAILS: <details>`;
  }

  private parseCommitAnalysis(content: string): { summary: string; details: string } {
    const summaryMatch = content.match(/SUMMARY:\s*(.+?)(?=\n\n|DETAILS:|$)/is);
    const detailsMatch = content.match(/DETAILS:\s*(.+?)$/is);

    return {
      summary: summaryMatch ? summaryMatch[1].trim() : 'No summary available',
      details: detailsMatch ? detailsMatch[1].trim() : content,
    };
  }

  private parsePRDescription(content: string): { title: string; description: string } {
    const titleMatch = content.match(/^#?\s*Title:?\s*(.+?)(?=\n\n|\n##|$)/i);
    const lines = content.split('\n');
    const title = titleMatch ? titleMatch[1].trim() : lines[0].replace(/^#+\s*/, '').trim();
    const description = titleMatch 
      ? content.slice(content.indexOf(titleMatch[0]) + titleMatch[0].length).trim()
      : lines.slice(1).join('\n').trim();

    return { title, description };
  }

  private buildSinglePrompt(branchName: string, commits: CommitInfo[], baseBranch: string): string {
    const commitsInfo = commits.map((c, i) => 
      `${i + 1}. **${c.hash}** - ${c.message}\n   Files: ${c.files.slice(0, 5).join(', ')}${c.files.length > 5 ? '...' : ''}\n   Stats: ${c.diff.split('\n').slice(-3, -1).join(' ')}`
    ).join('\n\n');

    return `Branch: ${branchName}\nBase: ${baseBranch}\nCommits: ${commits.length}\n\n${commitsInfo}`;
  }

  private getSingleAgentSystemPrompt(): string {
    return this.promptLoader.getPrompt('pr');
  }

  private parseSingleResponse(content: string, commits: CommitInfo[]): { 
    title: string; 
    description: string; 
    commitSummaries: { hash: string; summary: string; details: string }[] 
  } {
    const title = '';
    let description = content.trim();
    const requiredHeading = '## 🚀 O que essa PR faz?';
    const hasRequiredHeading = description.includes(requiredHeading);

    if (!hasRequiredHeading) {
      description = this.getPRTemplate();
    } else if (!description.includes('Não se esqueça de revisar essa descrição')) {
      description = `${description.trim()}\n\nNão se esqueça de revisar essa descrição`;
    }

    const commitSummaries: { hash: string; summary: string; details: string }[] = [];
    for (const commit of commits) {
      commitSummaries.push({
        hash: commit.hash,
        summary: commit.message.slice(0, 60),
        details: '',
      });
    }

    return { title, description, commitSummaries };
  }

  private generateDefaultTitle(branchName: string): string {
    return branchName;
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

  private getPRTemplate(): string {
    if (this.prTemplateCache) {
      return this.prTemplateCache;
    }

    try {
      const fs = require('fs');
      const raw = fs.readFileSync(this.prTemplatePath, 'utf-8').trimEnd();
      this.prTemplateCache = this.normalizeTemplate(raw);
      return this.prTemplateCache;
    } catch {
      const fallback = this.buildDefaultTemplate();
      this.prTemplateCache = fallback;
      return this.prTemplateCache;
    }
  }

  private normalizeTemplate(raw: string): string {
    const trimmed = raw.trimEnd();
    if (trimmed.includes('Não se esqueça de revisar essa descrição')) {
      return trimmed;
    }
    return `${trimmed}\n\nNão se esqueça de revisar essa descrição`;
  }

  private buildDefaultTemplate(): string {
    return [
      '## 🚀 O que essa PR faz?',
      '',
      '## 🛠️ O que foi mexido? (Em quais módulos/classes/entidades)',
      '',
      '## 💡 O foi feito? (Resumo técnico)',
      '',
      '## 🧪 Como testar? (Simule a request/flow que o usuário deve seguir para testar)',
      '',
      '## ✅ Checklist do Dev',
      '',
      '## 📸 Prints / GIFs (Se for UI)',
      '',
      '## 🔗 Link da Task',
      '',
      'Não se esqueça de revisar essa descrição',
    ].join('\n');
  }
}
