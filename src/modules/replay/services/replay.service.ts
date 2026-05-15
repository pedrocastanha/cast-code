import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ReplayEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  timestamp: number;
}

export interface ReplaySession {
  id: string;
  name?: string;
  project: string;
  model: string;
  createdAt: number;
  entries: ReplayEntry[];
}

export interface ReplaySummary {
  name: string;
  project: string;
  model: string;
  date: string;
  messages: number;
  fileName: string;
}

export interface SavedReplaySnapshot {
  name: string;
  fileName: string;
  filePath: string;
  entries: number;
}

@Injectable()
export class ReplayService {
  private currentSession: ReplaySession;

  constructor() {
    fs.mkdirSync(this.getReplayDir(), { recursive: true });
    this.currentSession = this.createSession();
  }

  recordEntry(entry: Omit<ReplayEntry, 'timestamp'>): void {
    this.currentSession.entries.push({ ...entry, timestamp: Date.now() });
    this.autoSave();
  }

  setModel(model: string): void {
    this.currentSession.model = model;
  }

  save(name: string): void {
    this.currentSession.name = name;
    const fileName = this.toReplayFileName(name);
    const filePath = path.join(this.getReplayDir(), fileName);
    fs.writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2));
  }

  saveSnapshot(name: string): SavedReplaySnapshot {
    this.currentSession.name = name;
    const replayDir = this.getReplayDir();
    fs.mkdirSync(replayDir, { recursive: true });
    const fileName = this.toReplayFileName(name);
    const filePath = path.join(replayDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2));
    return {
      name,
      fileName,
      filePath,
      entries: this.currentSession.entries.length,
    };
  }

  list(): ReplaySummary[] {
    const results: ReplaySummary[] = [];

    const replayDir = this.getReplayDir();
    const currentPath = path.join(replayDir, '_current.json');
    if (fs.existsSync(currentPath)) {
      try {
        const data: ReplaySession = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
        results.push({
          name: '(current session)',
          project: path.basename(data.project || process.cwd()),
          model: data.model || 'unknown',
          date: new Date(data.createdAt).toLocaleDateString(),
          messages: data.entries.filter(e => e.role === 'user').length,
          fileName: '_current.json',
        });
      } catch {}
    }

    const files = fs.readdirSync(replayDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    const saved = files
      .map(f => {
        try {
          const data: ReplaySession = JSON.parse(fs.readFileSync(path.join(replayDir, f), 'utf8'));
          return {
            name: data.name || f.replace('.json', ''),
            project: path.basename(data.project || process.cwd()),
            model: data.model || 'unknown',
            date: new Date(data.createdAt).toLocaleDateString(),
            messages: data.entries.filter(e => e.role === 'user').length,
            fileName: f,
          } as ReplaySummary;
        } catch {
          return null;
        }
      })
      .filter((s): s is ReplaySummary => s !== null)
      .sort((a, b) => b.date.localeCompare(a.date));

    return [...results, ...saved];
  }

  getSession(name: string): ReplaySession | null {
    const fileName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const filePath = path.join(this.getReplayDir(), `${fileName}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  private createSession(): ReplaySession {
    return {
      id: Date.now().toString(36),
      project: process.cwd(),
      model: '',
      createdAt: Date.now(),
      entries: [],
    };
  }

  private autoSave(): void {
    try {
      const replayDir = this.getReplayDir();
      fs.mkdirSync(replayDir, { recursive: true });
      fs.writeFileSync(path.join(replayDir, '_current.json'), JSON.stringify(this.currentSession, null, 2));
    } catch {}
  }

  private getReplayDir(): string {
    return process.env.CAST_REPLAYS_DIR || path.join(os.homedir(), '.cast', 'replays');
  }

  private toReplayFileName(name: string): string {
    const fileName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    return `${fileName || 'session'}.json`;
  }
}
