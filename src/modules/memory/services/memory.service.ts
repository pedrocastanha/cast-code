import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

@Injectable()
export class MemoryService {
  private memoryDir: string = '';
  private initialized = false;
  private cachedMemoryContent: string = '';
  private readonly blockedWritePatterns = [
    /ignore previous instructions/i,
    /reveal system prompt/i,
    /exfiltrate/i,
    /send secrets/i,
    /dump environment variables/i,
  ];

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

    await this.withMemoryLock(async () => {
      await this.ensureMemoryFile(
        'MEMORY.md',
        '# Project Memory\n\nThis file is loaded into the system prompt each session.\nSave important learnings, patterns, and insights here.\n',
      );
      await this.ensureMemoryFile(
        'USER.md',
        '# User Memory\n\nThis file stores local user preferences and durable notes.\n',
      );
    });

    this.initialized = true;
  }

  async getMemoryPrompt(): Promise<string> {
    if (!this.initialized) return '';

    try {
      const memoryFile = path.join(this.memoryDir, 'MEMORY.md');
      const content = await fs.readFile(memoryFile, 'utf-8');
      const lines = content.split('\n');

      const result = lines.length > 200
        ? lines.slice(0, 200).join('\n') + '\n... (truncated at 200 lines)'
        : content;

      this.cachedMemoryContent = result;
      return result;
    } catch {
      return '';
    }
  }

  getCachedMemoryPrompt(): string {
    return this.cachedMemoryContent;
  }

  async write(filename: string, content: string): Promise<string> {
    if (!this.initialized) {
      return 'Memory not initialized. No project detected.';
    }

    const resolved = this.resolveMemoryFile(filename);
    if (!resolved) return 'Invalid memory filename.';
    const { safeName, filePath } = resolved;

    if (this.hasBlockedMemoryPattern(content)) {
      return 'Memory write blocked: unsafe content matched prompt-injection or exfiltration patterns.';
    }

    await this.withMemoryLock(() => this.safeWriteFile(filePath, content));
    return `Memory saved: ${safeName}`;
  }

  async read(filename?: string): Promise<string> {
    if (!this.initialized) {
      return 'Memory not initialized. No project detected.';
    }

    if (filename) {
      const resolved = this.resolveMemoryFile(filename);
      if (!resolved) return 'Invalid memory filename.';
      const { safeName, filePath } = resolved;

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

  private resolveMemoryFile(filename: string): { safeName: string; filePath: string } | null {
    const cleanName = path.basename(filename.trim());
    const safeName = cleanName.endsWith('.md') ? cleanName : `${cleanName}.md`;
    if (!safeName || safeName === '.md' || safeName.includes('..') || path.isAbsolute(filename)) {
      return null;
    }
    const filePath = path.resolve(this.memoryDir, safeName);
    const memoryRoot = path.resolve(this.memoryDir);
    if (!filePath.startsWith(`${memoryRoot}${path.sep}`)) {
      return null;
    }
    return { safeName, filePath };
  }

  private async ensureMemoryFile(filename: string, defaultContent: string): Promise<void> {
    const filePath = path.join(this.memoryDir, filename);
    try {
      await fs.access(filePath);
    } catch {
      await this.safeWriteFile(filePath, defaultContent);
    }
  }

  private hasBlockedMemoryPattern(content: string): boolean {
    return this.blockedWritePatterns.some((pattern) => pattern.test(content));
  }

  private async safeWriteFile(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  private async withMemoryLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockPath = path.join(this.memoryDir, '.memory.lock');
    let handle: fs.FileHandle | null = null;

    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(`${process.pid}\n`, 'utf-8');
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    if (!handle) {
      throw new Error('Timed out acquiring memory lock');
    }

    try {
      return await operation();
    } finally {
      await handle.close();
      await fs.unlink(lockPath).catch(() => {});
    }
  }
}
