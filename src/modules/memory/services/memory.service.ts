import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

@Injectable()
export class MemoryService {
  private memoryDir: string = '';
  private initialized = false;

  async initialize(projectPath: string): Promise<void> {
    const hash = crypto
      .createHash('md5')
      .update(projectPath)
      .digest('hex')
      .slice(0, 12);

    this.memoryDir = path.join(
      os.homedir(),
      '.cast',
      'projects',
      hash,
      'memory',
    );

    await fs.mkdir(this.memoryDir, { recursive: true });

    const memoryFile = path.join(this.memoryDir, 'MEMORY.md');
    try {
      await fs.access(memoryFile);
    } catch {
      await fs.writeFile(
        memoryFile,
        '# Project Memory\n\nThis file is loaded into the system prompt each session.\nSave important learnings, patterns, and insights here.\n',
        'utf-8',
      );
    }

    this.initialized = true;
  }

  async getMemoryPrompt(): Promise<string> {
    if (!this.initialized) return '';

    try {
      const memoryFile = path.join(this.memoryDir, 'MEMORY.md');
      const content = await fs.readFile(memoryFile, 'utf-8');
      const lines = content.split('\n');

      if (lines.length > 200) {
        return lines.slice(0, 200).join('\n') + '\n... (truncated at 200 lines)';
      }

      return content;
    } catch {
      return '';
    }
  }

  async write(filename: string, content: string): Promise<string> {
    if (!this.initialized) {
      return 'Memory not initialized. No project detected.';
    }

    const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;
    const filePath = path.join(this.memoryDir, safeName);

    await fs.writeFile(filePath, content, 'utf-8');
    return `Memory saved: ${safeName}`;
  }

  async read(filename?: string): Promise<string> {
    if (!this.initialized) {
      return 'Memory not initialized. No project detected.';
    }

    if (filename) {
      const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;
      const filePath = path.join(this.memoryDir, safeName);

      try {
        return await fs.readFile(filePath, 'utf-8');
      } catch {
        return `Memory file not found: ${safeName}`;
      }
    }

    try {
      const files = await fs.readdir(this.memoryDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      if (mdFiles.length === 0) {
        return 'No memory files found.';
      }

      return `Memory files:\n${mdFiles.map((f) => `  - ${f}`).join('\n')}`;
    } catch {
      return 'Error reading memory directory.';
    }
  }

  async search(query: string): Promise<string> {
    if (!this.initialized) {
      return 'Memory not initialized. No project detected.';
    }

    try {
      const files = await fs.readdir(this.memoryDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));
      const results: string[] = [];

      const regex = new RegExp(query, 'gi');

      for (const file of mdFiles) {
        const filePath = path.join(this.memoryDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        const matches = lines.filter((line) => regex.test(line));
        regex.lastIndex = 0;

        if (matches.length > 0) {
          results.push(`--- ${file} ---`);
          matches.forEach((m) => results.push(`  ${m.trim()}`));
          results.push('');
        }
      }

      if (results.length === 0) {
        return `No matches found for "${query}" in memory.`;
      }

      return results.join('\n');
    } catch {
      return 'Error searching memory.';
    }
  }

  getMemoryDir(): string {
    return this.memoryDir;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
