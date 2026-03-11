import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const VAULT_DIR = path.join(os.homedir(), '.cast', 'snippets');

export interface Snippet {
  name: string;
  description: string;
  language: string;
  code: string;
  createdAt: string;
  tags: string[];
}

@Injectable()
export class VaultService {
  constructor() {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }

  saveSnippet(
    name: string,
    code: string,
    description: string,
    language = 'typescript',
    tags: string[] = [],
  ): void {
    const content = this.buildMarkdown({ name, code, description, language, tags, createdAt: new Date().toISOString() });
    fs.writeFileSync(this.snippetPath(name), content);
  }

  listSnippets(): Array<{ name: string; description: string; language: string }> {
    if (!fs.existsSync(VAULT_DIR)) return [];
    return fs
      .readdirSync(VAULT_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const meta = this.parseFrontmatter(fs.readFileSync(path.join(VAULT_DIR, f), 'utf8'));
        return {
          name: meta['name'] || f.replace('.md', ''),
          description: meta['description'] || '',
          language: meta['language'] || '',
        };
      });
  }

  getSnippet(name: string): Snippet | null {
    const filePath = this.snippetPath(name);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const meta = this.parseFrontmatter(content);
    const parts = content.split(/^---$/m);
    const code = parts.length >= 3 ? parts.slice(2).join('---').trim() : '';
    return {
      name: meta['name'] || name,
      description: meta['description'] || '',
      language: meta['language'] || 'typescript',
      createdAt: meta['createdAt'] || '',
      tags: (meta['tags'] || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      code,
    };
  }

  /** Promote a snippet to a skill by copying it to the skills directory */
  promoteToSkill(name: string, skillsDir: string): boolean {
    const snippet = this.getSnippet(name);
    if (!snippet) return false;

    const skillPath = path.join(skillsDir, `${name.replace(/\s+/g, '-')}.md`);
    const skillContent = `---
name: ${snippet.name}
description: ${snippet.description}
language: ${snippet.language}
---

## Overview
${snippet.description}

## Code

\`\`\`${snippet.language}
${snippet.code}
\`\`\`
`;
    fs.writeFileSync(skillPath, skillContent);
    return true;
  }

  deleteSnippet(name: string): boolean {
    const filePath = this.snippetPath(name);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  private snippetPath(name: string): string {
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    return path.join(VAULT_DIR, `${safeName}.md`);
  }

  private buildMarkdown(snippet: Snippet): string {
    return `---
name: ${snippet.name}
description: ${snippet.description}
language: ${snippet.language}
tags: ${snippet.tags.join(', ')}
createdAt: ${snippet.createdAt}
---

${snippet.code}
`;
  }

  private parseFrontmatter(content: string): Record<string, string> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const result: Record<string, string> = {};
    match[1].split('\n').forEach(line => {
      const colonIdx = line.indexOf(': ');
      if (colonIdx !== -1) {
        result[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 2).trim();
      }
    });
    return result;
  }
}
