import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const REPLAYS_DIR = path.join(os.homedir(), '.cast', 'replays');

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

@Injectable()
export class ReplayService {
  private currentSession: ReplaySession;

  constructor() {
    fs.mkdirSync(REPLAYS_DIR, { recursive: true });
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
    const fileName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const filePath = path.join(REPLAYS_DIR, `${fileName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2));
  }

  list(): ReplaySummary[] {
    const files = fs.readdirSync(REPLAYS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    return files
      .map(f => {
        try {
          const data: ReplaySession = JSON.parse(fs.readFileSync(path.join(REPLAYS_DIR, f), 'utf8'));
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
  }

  getSession(name: string): ReplaySession | null {
    const fileName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const filePath = path.join(REPLAYS_DIR, `${fileName}.json`);
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
      fs.writeFileSync(path.join(REPLAYS_DIR, '_current.json'), JSON.stringify(this.currentSession, null, 2));
    } catch {}
  }
}
