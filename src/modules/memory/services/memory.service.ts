import { Injectable, Optional } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { StateDbService } from '../../state/services/state-db.service';

type MemoryEntry = {
  filename: string;
  content: string;
  updatedAt?: string;
};

@Injectable()
export class MemoryService {
  private memoryDir: string = '';
  private projectPath: string = '';
  private projectHash: string = '';
  private initialized = false;
  private cachedMemoryContent: string = '';
  private readonly blockedWritePatterns = [
    /ignore previous instructions/i,
    /reveal system prompt/i,
    /exfiltrate/i,
    /send secrets/i,
    /dump environment variables/i,
  ];

  constructor(@Optional() private readonly stateDb?: StateDbService) {}

  async initialize(projectPath: string): Promise<void> {
    const hash = crypto
      .createHash('md5')
      .update(projectPath)
      .digest('hex')
      .slice(0, 12);

    this.projectPath = projectPath;
    this.projectHash = hash;
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
    await this.syncMarkdownFilesToSqlite();
    await this.getMemoryPrompt();
  }

  async getMemoryPrompt(): Promise<string> {
    if (!this.initialized) return '';

    try {
      const entries = await this.getMemoryEntries();
      const result = this.formatMemoryPrompt(entries);

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
    await this.upsertSqliteMemory(safeName, content);
    await this.getMemoryPrompt();
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

      const sqliteEntry = await this.getSqliteMemoryEntry(safeName);
      if (sqliteEntry) {
        return sqliteEntry.content;
      }

      try {
        return await fs.readFile(filePath, 'utf-8');
      } catch {
        return `Memory file not found: ${safeName}`;
      }
    }

    try {
      const entries = await this.getMemoryEntries();

      if (entries.length === 0) {
        return 'No memory files found.';
      }

      return `Memory files:\n${entries.map((entry) => `  - ${entry.filename}`).join('\n')}`;
    } catch {
      return 'Error reading memory directory.';
    }
  }

  async search(query: string): Promise<string> {
    if (!this.initialized) {
      return 'Memory not initialized. No project detected.';
    }

    try {
      const sqliteMatches = await this.searchSqliteMemory(query);
      if (sqliteMatches.length > 0) {
        return this.formatSearchResults(sqliteMatches);
      }

      const entries = await this.getMemoryEntries();
      const results: string[] = [];
      const fuzzyResults: string[] = [];

      const regex = this.createSearchRegex(query);
      const queryTerms = this.normalizeSearchTerms(query);

      for (const entry of entries) {
        const lines = entry.content.split('\n');
        const matches = regex
          ? lines.filter((line) => {
            const matched = regex.test(line);
            regex.lastIndex = 0;
            return matched;
          })
          : [];

        if (matches.length > 0) {
          results.push(`--- ${entry.filename} ---`);
          matches.forEach((m) => results.push(`  ${m.trim()}`));
          results.push('');
          continue;
        }

        const fuzzyMatches = queryTerms.length > 0
          ? lines.filter((line) => this.matchesSearchTerms(line, queryTerms))
          : [];

        if (fuzzyMatches.length > 0) {
          fuzzyResults.push(`--- ${entry.filename} ---`);
          fuzzyMatches.forEach((m) => fuzzyResults.push(`  ${m.trim()}`));
          fuzzyResults.push('');
        }
      }

      if (results.length === 0) {
        if (fuzzyResults.length === 0) {
          return `No matches found for "${query}" in memory.`;
        }
        return fuzzyResults.join('\n');
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

  private async getOrderedMemoryFiles(): Promise<string[]> {
    const files = await fs.readdir(this.memoryDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    return this.sortMemoryFilenames(mdFiles);
  }

  private sortMemoryFilenames(files: string[]): string[] {
    const priority = new Map([
      ['MEMORY.md', 0],
      ['USER.md', 1],
    ]);

    return [...files].sort((a, b) => {
      const priorityA = priority.get(a) ?? 10;
      const priorityB = priority.get(b) ?? 10;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.localeCompare(b);
    });
  }

  private createSearchRegex(query: string): RegExp | null {
    try {
      return new RegExp(query, 'gi');
    } catch {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return escaped ? new RegExp(escaped, 'gi') : null;
    }
  }

  private normalizeSearchTerms(value: string): string[] {
    const stopWords = new Set([
      'a', 'as', 'o', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das',
      'e', 'eu', 'me', 'meu', 'minha', 'como', 'que', 'qual', 'quais',
      'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'my', 'me', 'how',
    ]);

    return Array.from(new Set(
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .match(/[a-z0-9-]{3,}/g) ?? [],
    ))
      .filter((term) => !stopWords.has(term))
      .map((term) => this.stemSearchTerm(term))
      .flatMap((term) => this.expandSearchTerm(term))
      .filter((term, index, terms) => terms.indexOf(term) === index);
  }

  private matchesSearchTerms(line: string, queryTerms: string[]): boolean {
    const lineTerms = new Set(this.normalizeSearchTerms(line));
    if (lineTerms.size === 0) {
      return false;
    }

    const matches = queryTerms.filter((term) => lineTerms.has(term)).length;
    return matches >= (queryTerms.length <= 3 ? 1 : 2);
  }

  private stemSearchTerm(term: string): string {
    return term
      .replace(/(?:ado|ada|idos|idas|ções|cao|ção|mente|ar|er|ir)$/i, '')
      .replace(/[aeios]$/i, '');
  }

  private expandSearchTerm(term: string): string[] {
    const terms = [term];
    if (term.startsWith('apelid') || term === 'nickname') {
      terms.push('cham', 'nom', 'called');
    }
    if (term.startsWith('cham') || term === 'called') {
      terms.push('apelid', 'nom');
    }
    if (term === 'nom' || term === 'name') {
      terms.push('cham', 'apelid');
    }
    return terms;
  }

  private async getMemoryEntries(): Promise<MemoryEntry[]> {
    const sqliteEntries = await this.getSqliteMemoryEntries();
    if (sqliteEntries) {
      return sqliteEntries;
    }
    return this.readMarkdownMemoryEntries();
  }

  private async readMarkdownMemoryEntries(): Promise<MemoryEntry[]> {
    const files = await this.getOrderedMemoryFiles();
    const entries: MemoryEntry[] = [];
    for (const file of files) {
      const filePath = path.join(this.memoryDir, file);
      entries.push({
        filename: file,
        content: await fs.readFile(filePath, 'utf-8'),
      });
    }
    return entries;
  }

  private formatMemoryPrompt(entries: MemoryEntry[]): string {
    return entries.map((entry) => {
      const lines = entry.content.split('\n');
      const body = lines.length > 200
        ? lines.slice(0, 200).join('\n') + '\n... (truncated at 200 lines)'
        : entry.content;
      return `--- ${entry.filename} ---\n${body.trimEnd()}`;
    }).join('\n\n');
  }

  private async syncMarkdownFilesToSqlite(): Promise<void> {
    if (!this.stateDb || !this.projectHash) {
      return;
    }

    try {
      const entries = await this.readMarkdownMemoryEntries();
      for (const entry of entries) {
        await this.upsertSqliteMemory(entry.filename, entry.content);
      }
    } catch {
      // Markdown memory remains the fallback when SQLite is unavailable.
    }
  }

  private async getSqliteMemoryEntry(filename: string): Promise<MemoryEntry | null> {
    if (!this.stateDb || !this.projectHash) {
      return null;
    }

    try {
      const db = await this.stateDb.getDb();
      const row = db.prepare(`
        select filename, content, updated_at as updatedAt
        from local_memory_entries
        where project_hash = ? and filename = ?
        limit 1
      `).get(this.projectHash, filename) as any;
      return row ? { filename: row.filename, content: row.content, updatedAt: row.updatedAt } : null;
    } catch {
      return null;
    }
  }

  private async getSqliteMemoryEntries(): Promise<MemoryEntry[] | null> {
    if (!this.stateDb || !this.projectHash) {
      return null;
    }

    try {
      const db = await this.stateDb.getDb();
      const rows = db.prepare(`
        select filename, content, updated_at as updatedAt
        from local_memory_entries
        where project_hash = ?
      `).all(this.projectHash) as any[];
      return this.sortMemoryFilenames(rows.map((row) => row.filename))
        .map((filename) => {
          const row = rows.find((candidate) => candidate.filename === filename);
          return { filename, content: row.content, updatedAt: row.updatedAt };
        });
    } catch {
      return null;
    }
  }

  private async upsertSqliteMemory(filename: string, content: string): Promise<void> {
    if (!this.stateDb || !this.projectHash) {
      return;
    }

    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const now = new Date().toISOString();
    await this.stateDb.executeWrite((db) => {
      const existing = db.prepare(`
        select id, created_at as createdAt
        from local_memory_entries
        where project_hash = ? and filename = ?
        limit 1
      `).get(this.projectHash, filename) as any;
      const id = existing?.id ?? crypto.randomUUID();
      const createdAt = existing?.createdAt ?? now;

      const run = db.transaction(() => {
        db.prepare(`
          insert into local_memory_entries (
            id, project_hash, project_root, filename, content, content_hash, source, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, 'local_file', ?, ?)
          on conflict(project_hash, filename) do update set
            project_root = excluded.project_root,
            content = excluded.content,
            content_hash = excluded.content_hash,
            source = excluded.source,
            updated_at = excluded.updated_at
        `).run(
          id,
          this.projectHash,
          this.projectPath,
          filename,
          content,
          contentHash,
          createdAt,
          now,
        );

        db.prepare('delete from local_memory_fts where project_hash = ? and filename = ?')
          .run(this.projectHash, filename);
        db.prepare(`
          insert into local_memory_fts (project_hash, filename, content, updated_at)
          values (?, ?, ?, ?)
        `).run(this.projectHash, filename, content, now);
      });

      run();
    });
  }

  private async searchSqliteMemory(query: string): Promise<Array<{ filename: string; lines: string[] }>> {
    if (!this.stateDb || !this.projectHash) {
      return [];
    }

    const ftsQuery = this.buildFtsQuery(query);
    if (!ftsQuery) {
      return [];
    }

    try {
      const db = await this.stateDb.getDb();
      const rows = db.prepare(`
        select filename, snippet(local_memory_fts, 2, '', '', '...', 32) as preview
        from local_memory_fts
        where local_memory_fts match ? and project_hash = ?
        order by rank
        limit 20
      `).all(ftsQuery, this.projectHash) as any[];

      return this.groupSearchRows(rows.map((row) => ({
        filename: row.filename,
        line: this.cleanSearchPreview(row.preview),
      })));
    } catch {
      return [];
    }
  }

  private buildFtsQuery(query: string): string {
    const terms = this.normalizeSearchTerms(query)
      .map((term) => term.replace(/[^a-z0-9]/gi, ''))
      .filter((term) => term.length >= 2);
    return terms.length > 0
      ? terms.map((term) => `${term}*`).join(' OR ')
      : '';
  }

  private groupSearchRows(rows: Array<{ filename: string; line: string }>): Array<{ filename: string; lines: string[] }> {
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const lines = grouped.get(row.filename) ?? [];
      if (row.line && !lines.includes(row.line)) {
        lines.push(row.line);
      }
      grouped.set(row.filename, lines);
    }

    return this.sortMemoryFilenames([...grouped.keys()])
      .map((filename) => ({ filename, lines: grouped.get(filename) ?? [] }));
  }

  private cleanSearchPreview(preview: unknown): string {
    return String(preview ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatSearchResults(results: Array<{ filename: string; lines: string[] }>): string {
    const output: string[] = [];
    for (const result of results) {
      output.push(`--- ${result.filename} ---`);
      result.lines.forEach((line) => output.push(`  ${line}`));
      output.push('');
    }
    return output.join('\n');
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
