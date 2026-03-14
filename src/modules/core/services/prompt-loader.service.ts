import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULTS_DIR = path.join(__dirname, '..', '..', '..', 'prompts', 'defaults');
const USER_DIR = path.join(os.homedir(), '.cast', 'prompts');

@Injectable()
export class PromptLoaderService {
  private cache = new Map<string, string>();

  onModuleInit(): void {
    this.seedUserPrompts();
  }

  getPrompt(name: string): string {
    if (this.cache.has(name)) return this.cache.get(name)!;
    const content = this.loadPrompt(name);
    this.cache.set(name, content);
    return content;
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  private loadPrompt(name: string): string {
    const userPath = path.join(USER_DIR, `${name}.md`);
    if (fs.existsSync(userPath)) {
      try { return fs.readFileSync(userPath, 'utf-8'); } catch { /* fallthrough */ }
    }
    const defaultPath = path.join(DEFAULTS_DIR, `${name}.md`);
    if (fs.existsSync(defaultPath)) {
      try { return fs.readFileSync(defaultPath, 'utf-8'); } catch { /* fallthrough */ }
    }
    return '';
  }

  private seedUserPrompts(): void {
    try {
      fs.mkdirSync(USER_DIR, { recursive: true });
      const defaults = fs.readdirSync(DEFAULTS_DIR).filter(f => f.endsWith('.md'));
      for (const file of defaults) {
        const dest = path.join(USER_DIR, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(DEFAULTS_DIR, file), dest);
        }
      }
    } catch { /* non-fatal: falls back to bundled defaults */ }
  }
}
