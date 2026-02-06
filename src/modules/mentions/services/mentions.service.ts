import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  MentionType,
  ParsedMention,
  ResolvedMention,
  MentionResult,
} from '../types';

const execAsync = promisify(exec);

@Injectable()
export class MentionsService {
  private readonly MAX_FILE_LINES = 500;
  private readonly MAX_FILE_SIZE = 100 * 1024; // 100KB
  private readonly MAX_DIR_ENTRIES = 100;
  private readonly MAX_URL_LENGTH = 50000;

  async processMessage(message: string): Promise<MentionResult> {
    const mentions = this.parseMentions(message);

    if (mentions.length === 0) {
      return {
        expandedMessage: message,
        mentions: [],
        originalMessage: message,
      };
    }

    const resolved = await Promise.all(
      mentions.map((m) => this.resolveMention(m)),
    );

    const expandedMessage = this.buildExpandedMessage(message, resolved);

    return {
      expandedMessage,
      mentions: resolved,
      originalMessage: message,
    };
  }

  private parseMentions(message: string): ParsedMention[] {
    const mentions: ParsedMention[] = [];

    const mentionRegex = /(?:^|\s)@((?:https?:\/\/\S+)|(?:git:[a-z]+)|(?:\.?\/?[\w./-]+\.[\w]+)|(?:\.?\/?[\w./-]+\/))/g;

    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(message)) !== null) {
      const target = match[1];
      const raw = '@' + target;

      let type: MentionType;
      let resolved: string;

      if (target.startsWith('http://') || target.startsWith('https://')) {
        type = MentionType.URL;
        resolved = target;
      } else if (target.startsWith('git:')) {
        type = MentionType.GIT;
        resolved = target;
      } else if (target.endsWith('/')) {
        type = MentionType.DIRECTORY;
        resolved = path.resolve(process.cwd(), target);
      } else {
        type = MentionType.FILE;
        resolved = path.resolve(process.cwd(), target);
      }

      mentions.push({ type, raw, target, resolved });
    }

    return mentions;
  }

  private async resolveMention(mention: ParsedMention): Promise<ResolvedMention> {
    try {
      switch (mention.type) {
        case MentionType.FILE:
          return await this.resolveFile(mention);
        case MentionType.DIRECTORY:
          return await this.resolveDirectory(mention);
        case MentionType.URL:
          return await this.resolveUrl(mention);
        case MentionType.GIT:
          return await this.resolveGit(mention);
        default:
          return { ...mention, content: '', error: 'Unknown mention type' };
      }
    } catch (error) {
      return {
        ...mention,
        content: '',
        error: `Failed to resolve: ${(error as Error).message}`,
      };
    }
  }

  private async resolveFile(mention: ParsedMention): Promise<ResolvedMention> {
    const filePath = mention.resolved;

    try {
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        return this.resolveDirectory({
          ...mention,
          type: MentionType.DIRECTORY,
        });
      }

      if (stat.size > this.MAX_FILE_SIZE) {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').slice(0, this.MAX_FILE_LINES);
        const numbered = lines.map((l, i) => `${i + 1}: ${l}`).join('\n');
        return {
          ...mention,
          content: numbered + `\n... (truncated, file is ${Math.round(stat.size / 1024)}KB)`,
        };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const numbered = lines.map((l, i) => `${i + 1}: ${l}`).join('\n');

      return { ...mention, content: numbered };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { ...mention, content: '', error: `File not found: ${filePath}` };
      }
      throw error;
    }
  }

  private async resolveDirectory(mention: ParsedMention): Promise<ResolvedMention> {
    const dirPath = mention.resolved;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const limited = entries.slice(0, this.MAX_DIR_ENTRIES);

      const lines = limited.map((e) => {
        const prefix = e.isDirectory() ? 'd' : 'f';
        return `${prefix} ${e.name}`;
      });

      let content = lines.join('\n');

      if (entries.length > this.MAX_DIR_ENTRIES) {
        content += `\n... (${entries.length - this.MAX_DIR_ENTRIES} more entries)`;
      }

      return { ...mention, content };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { ...mention, content: '', error: `Directory not found: ${dirPath}` };
      }
      throw error;
    }
  }

  private async resolveUrl(mention: ParsedMention): Promise<ResolvedMention> {
    try {
      const response = await fetch(mention.resolved, {
        headers: { 'User-Agent': 'Cast-Code/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return {
          ...mention,
          content: '',
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      let text = await response.text();

      if (text.length > this.MAX_URL_LENGTH) {
        text = text.slice(0, this.MAX_URL_LENGTH) + '\n... (truncated)';
      }

      return { ...mention, content: text };
    } catch (error) {
      return {
        ...mention,
        content: '',
        error: `Fetch failed: ${(error as Error).message}`,
      };
    }
  }

  private async resolveGit(mention: ParsedMention): Promise<ResolvedMention> {
    const command = mention.target.replace('git:', '');

    const gitCommands: Record<string, string> = {
      status: 'git status',
      diff: 'git diff',
      log: 'git log --oneline -20',
      branch: 'git branch -a',
      stash: 'git stash list',
    };

    const cmd = gitCommands[command];

    if (!cmd) {
      return {
        ...mention,
        content: '',
        error: `Unknown git command: ${command}. Available: ${Object.keys(gitCommands).join(', ')}`,
      };
    }

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: process.cwd(),
        timeout: 10000,
      });

      return { ...mention, content: stdout || stderr || '(no output)' };
    } catch (error) {
      return {
        ...mention,
        content: '',
        error: `Git command failed: ${(error as Error).message}`,
      };
    }
  }

  private buildExpandedMessage(
    originalMessage: string,
    mentions: ResolvedMention[],
  ): string {
    let expanded = originalMessage;

    for (const mention of mentions) {
      expanded = expanded.replace(mention.raw, '').trim();
    }

    const contextParts: string[] = [];

    for (const mention of mentions) {
      if (mention.error) {
        contextParts.push(
          `<mention_error target="${mention.target}">\n${mention.error}\n</mention_error>`,
        );
        continue;
      }

      switch (mention.type) {
        case MentionType.FILE:
          contextParts.push(
            `<file path="${mention.target}">\n${mention.content}\n</file>`,
          );
          break;
        case MentionType.DIRECTORY:
          contextParts.push(
            `<directory path="${mention.target}">\n${mention.content}\n</directory>`,
          );
          break;
        case MentionType.URL:
          contextParts.push(
            `<url href="${mention.target}">\n${mention.content}\n</url>`,
          );
          break;
        case MentionType.GIT:
          contextParts.push(
            `<git command="${mention.target.replace('git:', '')}">\n${mention.content}\n</git>`,
          );
          break;
      }
    }

    if (contextParts.length > 0) {
      return expanded + '\n\n' + contextParts.join('\n\n');
    }

    return expanded;
  }

  getMentionsSummary(mentions: ResolvedMention[]): string[] {
    return mentions.map((m) => {
      if (m.error) {
        return `  ✗ ${m.raw} → ${m.error}`;
      }

      const lines = m.content.split('\n').length;
      switch (m.type) {
        case MentionType.FILE:
          return `  ✓ ${m.raw} (${lines} lines)`;
        case MentionType.DIRECTORY:
          return `  ✓ ${m.raw} (${lines} entries)`;
        case MentionType.URL:
          return `  ✓ ${m.raw} (${m.content.length} chars)`;
        case MentionType.GIT:
          return `  ✓ ${m.raw}`;
        default:
          return `  ✓ ${m.raw}`;
      }
    });
  }
}
