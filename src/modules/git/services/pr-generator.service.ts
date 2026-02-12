import { Injectable } from '@nestjs/common';
import { execSync } from 'child_process';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LlmService } from '../../../common/services/llm.service';
import { MonorepoDetectorService } from './monorepo-detector.service';

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
  constructor(
    private readonly llmService: LlmService,
    private readonly monorepoDetector: MonorepoDetectorService,
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
      
      // Check if base branch exists locally or remotely
      try {
        execSync(`git rev-parse --verify ${baseBranch}`, { cwd, stdio: 'ignore' });
      } catch {
        // Try remote branch
        try {
          execSync(`git rev-parse --verify origin/${baseBranch}`, { cwd, stdio: 'ignore' });
        } catch {
          return [];
        }
      }

      // Get commits that are in current branch but not in base
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

      return commits.reverse(); // Oldest first
    } catch (error) {
      return [];
    }
  }

  async analyzeCommit(commit: CommitInfo): Promise<{ summary: string; details: string }> {
    const llm = this.llmService.createModel();

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
    const commitAnalyses = await Promise.all(
      commits.map(async (commit) => {
        const analysis = await this.analyzeCommit(commit);
        return {
          hash: commit.hash,
          message: commit.message,
          ...analysis,
        };
      }),
    );

    const llm = this.llmService.createModel();
    const prompt = this.buildPRDescriptionPrompt(branchName, commitAnalyses, baseBranch);

    const response = await llm.invoke([
      new SystemMessage(this.getPRDescriptionSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    const content = this.extractContent(response.content);
    const { title, description } = this.parsePRDescription(content);

    return {
      title: title || this.generateDefaultTitle(branchName),
      description,
      commits: commitAnalyses.map(ca => ({
        hash: ca.hash,
        summary: ca.summary,
        details: ca.details,
      })),
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
    return `# ${title}

${description}

---
**Base Branch:** ${baseBranch}
**Generated by:** Cast Code`;
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
          // Azure URLs are more complex, would need to parse the project/repo
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

    return `Analyze this commit and provide a summary:

**Commit:** ${commit.hash}
**Message:** ${commit.message}
**Author:** ${commit.author}
**Date:** ${commit.date}
**Scope:** ${scope || 'general'}

**Files Changed:**
${commit.files.join('\n')}

**Diff Stats:**
${commit.diff}

Provide:
1. A one-line summary of what this commit does (max 100 chars)
2. Detailed explanation of the changes, technical approach, and impact`;
  }

  private buildPRDescriptionPrompt(
    branchName: string, 
    commits: { hash: string; message: string; summary: string; details: string }[],
    baseBranch: string,
  ): string {
    const commitsSummary = commits.map((c, i) => 
      `${i + 1}. **${c.hash}** - ${c.summary}\n   ${c.details.slice(0, 200)}...`
    ).join('\n\n');

    return `Create a Pull Request description based on the following commits from branch "${branchName}" to "${baseBranch}".

**Branch:** ${branchName}
**Base:** ${baseBranch}
**Commits Count:** ${commits.length}

**Commits Summary:**
${commitsSummary}

Generate:
1. A clear, concise PR title (use the branch name as inspiration: "${branchName}")
2. A comprehensive PR description that includes:
   - Overview of what this PR accomplishes
   - Main changes and their purpose
   - Technical details worth noting
   - Any breaking changes or migration notes
   - Testing considerations`;
  }

  private getCommitAnalysisSystemPrompt(): string {
    return `You are a code reviewer analyzing a git commit. Provide:

1. **Summary**: One clear sentence describing what this commit does (max 100 chars)
2. **Details**: A detailed paragraph explaining:
   - What was changed and why
   - Technical approach taken
   - Impact on the codebase
   - Any potential concerns or considerations

Format your response as:
SUMMARY: <your summary here>

DETAILS: <your detailed explanation here>`;
  }

  private getPRDescriptionSystemPrompt(): string {
    return `You are creating a Pull Request description. Follow these guidelines:

**Title:**
- Use the branch name as the title (it already follows naming conventions)
- Keep it concise but descriptive

**Description Structure:**
\`\`\`markdown
## Overview
Brief explanation of what this PR accomplishes

## Changes
- Key change 1
- Key change 2
- ...

## Technical Details
Important implementation details, architecture decisions, or patterns used

## Commits
Summary of each commit with hash and description

## Testing
How to test these changes

## Breaking Changes (if any)
List any breaking changes and migration steps
\`\`\`

Be concise but thorough. Use markdown formatting.`;
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

  private generateDefaultTitle(branchName: string): string {
    return branchName
      .replace(/^(feature|fix|hotfix|release)\//, '')
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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
}
