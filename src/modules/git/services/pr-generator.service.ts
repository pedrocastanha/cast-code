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

  detectDefaultBaseBranch(): string {
    try {
      const cwd = process.cwd();
      // Check common base branch names in order of preference
      const candidates = ['main', 'master', 'develop'];
      
      for (const branch of candidates) {
        try {
          // Check if branch exists locally or remotely
          execSync(`git rev-parse --verify ${branch} 2>/dev/null || git rev-parse --verify origin/${branch} 2>/dev/null`, { 
            cwd, 
            stdio: 'ignore' 
          });
          return branch;
        } catch {
          // Branch doesn't exist, try next
        }
      }
      
      return 'main'; // fallback
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

        // Get files changed in this commit
        const filesOutput = execSync(
          `git diff-tree --no-commit-id --name-only -r ${hash}`,
          { cwd, encoding: 'utf-8' }
        );
        const files = filesOutput.trim().split('\n').filter(f => f);

        // Get diff stats for this commit
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
    // Use single agent to analyze all commits at once
    const llm = this.llmService.createModel();
    const prompt = this.buildSinglePrompt(branchName, commits, baseBranch);

    const response = await llm.invoke([
      new SystemMessage(this.getSingleAgentSystemPrompt()),
      new HumanMessage(prompt),
    ]);

    const content = this.extractContent(response.content);
    const { title, description, commitSummaries } = this.parseSingleResponse(content, commits);

    return {
      title: title || this.generateDefaultTitle(branchName),
      description,
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

    // Only GitHub is supported for automatic creation
    if (platform !== 'github') {
      return {
        success: false,
        error: `Automatic PR creation not supported for ${platform}. Description generated and copied to clipboard.`,
        description: this.formatPRForClipboard(title, description, baseBranch),
        platform,
      };
    }

    // Check if gh CLI is available
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

      // Create PR using gh CLI
      const tempFile = `/tmp/pr-body-${Date.now()}.md`;
      require('fs').writeFileSync(tempFile, description);

      try {
        const result = execSync(
          `gh pr create --title "${title.replace(/"/g, '\\"')}" --body-file "${tempFile}" --base "${baseBranch}"`,
          { cwd, encoding: 'utf-8' }
        );
        
        // Extract URL from result
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
    return `# ${title}\n\n${description}\n\n---\n**Base Branch:** ${baseBranch}\n**Generated by:** Cast Code`;
  }

  getPRCreateUrl(platform: string, baseBranch: string): string | null {
    try {
      const remoteUrl = execSync('git remote get-url origin', { 
        cwd: process.cwd(), 
        encoding: 'utf-8' 
      }).trim();

      const branch = this.getCurrentBranch();

      // Convert SSH to HTTPS if needed
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

  private buildPRDescriptionPrompt(
    branchName: string, 
    commits: { hash: string; message: string; summary: string; details: string }[],
    baseBranch: string,
  ): string {
    const commitsSummary = commits.map((c, i) => 
      `${i + 1}. **${c.hash}** - ${c.summary}\n   ${c.details.slice(0, 200)}...`
    ).join('\n\n');

    return `Create a PR description for branch "${branchName}" to "${baseBranch}".\n\n**Commits:**\n${commitsSummary}\n\nGenerate:\n1. PR title (use branch name as inspiration)\n2. Description with: Overview, Changes, Technical Details, Testing`;
  }

  private getCommitAnalysisSystemPrompt(): string {
    return `Analyze a git commit. Provide:\n\n1. **Summary**: One sentence (max 100 chars)\n2. **Details**: Detailed paragraph about changes\n\nFormat:\nSUMMARY: <summary>\n\nDETAILS: <details>`;
  }

  private getPRDescriptionSystemPrompt(): string {
    return `Create a Pull Request description.\n\n**Title:** Concise, descriptive\n\n**Description Structure:**\n\`\`\`markdown\n## Overview\nBrief explanation\n\n## Changes\n- Change 1\n- Change 2\n\n## Technical Details\nImplementation details\n\n## Testing\nHow to test\n\`\`\``;
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

  // Single agent approach - analyze all commits at once
  private buildSinglePrompt(branchName: string, commits: CommitInfo[], baseBranch: string): string {
    const commitsInfo = commits.map((c, i) => 
      `${i + 1}. **${c.hash}** - ${c.message}\n   Files: ${c.files.slice(0, 5).join(', ')}${c.files.length > 5 ? '...' : ''}\n   Stats: ${c.diff.split('\n').slice(-3, -1).join(' ')}`
    ).join('\n\n');

    return `Branch: ${branchName}\nBase: ${baseBranch}\nCommits: ${commits.length}\n\n${commitsInfo}`;
  }

  private getSingleAgentSystemPrompt(): string {
    return `You are a senior developer creating a Pull Request description. Analyze ALL commits and generate a comprehensive PR description.

**OUTPUT FORMAT:**
TITLE: <PR title based on branch name and overall changes>

OVERVIEW: <2-3 sentences explaining what this PR accomplishes>

CHANGES:
- <key change 1>
- <key change 2>
- ...

TECHNICAL_DETAILS: <important implementation details, architecture decisions>

COMMITS:
<hash>: <one-line summary of what this commit does>
(repeat for each commit)

TESTING: <how to test these changes>`;
  }

  private parseSingleResponse(content: string, commits: CommitInfo[]): { 
    title: string; 
    description: string; 
    commitSummaries: { hash: string; summary: string; details: string }[] 
  } {
    const titleMatch = content.match(/TITLE:\s*(.+?)(?=\n\n|\n[A-Z]|$)/i);
    const overviewMatch = content.match(/OVERVIEW:\s*([\s\S]+?)(?=\n\nCHANGES:|CHANGES:)/i);
    const changesMatch = content.match(/CHANGES:\s*([\s\S]+?)(?=\n\nTECHNICAL_DETAILS:|TECHNICAL_DETAILS:)/i);
    const technicalMatch = content.match(/TECHNICAL_DETAILS:\s*([\s\S]+?)(?=\n\nCOMMITS:|COMMITS:)/i);
    const commitsMatch = content.match(/COMMITS:\s*([\s\S]+?)(?=\n\nTESTING:|TESTING:|$)/i);
    const testingMatch = content.match(/TESTING:\s*([\s\S]+)$/i);

    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Build markdown description
    const parts: string[] = [];
    
    if (overviewMatch) {
      parts.push('## Overview\n' + overviewMatch[1].trim());
    }
    
    if (changesMatch) {
      parts.push('## Changes\n' + changesMatch[1].trim());
    }
    
    if (technicalMatch) {
      parts.push('## Technical Details\n' + technicalMatch[1].trim());
    }
    
    if (testingMatch) {
      parts.push('## Testing\n' + testingMatch[1].trim());
    }

    const description = parts.join('\n\n');

    // Parse commit summaries
    const commitSummaries: { hash: string; summary: string; details: string }[] = [];
    
    if (commitsMatch) {
      const commitsText = commitsMatch[1].trim();
      const lines = commitsText.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^([a-f0-9]+):\s*(.+)$/i);
        if (match) {
          commitSummaries.push({
            hash: match[1].slice(0, 7),
            summary: match[2].trim(),
            details: '',
          });
        }
      }
    }

    // Fallback: if no commit summaries parsed, create simple ones from commits
    if (commitSummaries.length === 0) {
      for (const commit of commits) {
        commitSummaries.push({
          hash: commit.hash,
          summary: commit.message.slice(0, 60),
          details: '',
        });
      }
    }

    return { title, description, commitSummaries };
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
