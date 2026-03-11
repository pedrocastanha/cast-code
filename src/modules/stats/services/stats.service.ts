import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const STATS_FILE = path.join(os.homedir(), '.cast', 'stats.json');

// Pricing per 1M tokens in USD (input/output)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 0.8, output: 4 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5': { input: 0.5, output: 1.5 },
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2': { input: 1.25, output: 5 },
  'ollama': { input: 0, output: 0 },
  'local': { input: 0, output: 0 },
};

export interface SessionStats {
  sessionId: string;
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  messageCount: number;
}

interface StatsData {
  sessions: SessionStats[];
}

@Injectable()
export class StatsService {
  private currentSession: SessionStats;
  private data: StatsData = { sessions: [] };

  constructor() {
    this.ensureDir();
    this.loadData();
    this.currentSession = this.createNewSession();
  }

  trackUsage(model: string, inputTokens: number, outputTokens: number): void {
    this.currentSession.model = this.normalizeModelName(model);
    this.currentSession.inputTokens += inputTokens;
    this.currentSession.outputTokens += outputTokens;
    this.currentSession.totalTokens += inputTokens + outputTokens;
    this.currentSession.messageCount++;
    this.currentSession.estimatedCostUsd = this.calculateCost(
      this.currentSession.model,
      this.currentSession.inputTokens,
      this.currentSession.outputTokens,
    );
    this.persistCurrentSession();
  }

  getSessionStats(): Readonly<SessionStats> {
    return { ...this.currentSession };
  }

  getTodayStats(): { tokens: number; cost: number; messages: number } {
    const today = this.todayDateStr();
    const todaySessions = this.data.sessions.filter(s => s.date === today && s.sessionId !== this.currentSession.sessionId);
    return {
      tokens: todaySessions.reduce((sum, s) => sum + s.totalTokens, 0) + this.currentSession.totalTokens,
      cost: todaySessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0) + this.currentSession.estimatedCostUsd,
      messages: todaySessions.reduce((sum, s) => sum + s.messageCount, 0) + this.currentSession.messageCount,
    };
  }

  getAllTimeStats(): { tokens: number; cost: number; sessions: number } {
    const allExcludingCurrent = this.data.sessions.filter(s => s.sessionId !== this.currentSession.sessionId);
    return {
      tokens: allExcludingCurrent.reduce((sum, s) => sum + s.totalTokens, 0) + this.currentSession.totalTokens,
      cost: allExcludingCurrent.reduce((sum, s) => sum + s.estimatedCostUsd, 0) + this.currentSession.estimatedCostUsd,
      sessions: allExcludingCurrent.length + 1,
    };
  }

  /** Short cost indicator for use in prompts, e.g. "~$0.023" */
  getSessionCostIndicator(): string {
    const cost = this.currentSession.estimatedCostUsd;
    if (cost === 0) return '';
    if (cost < 0.001) return '<$0.001';
    return `~$${cost.toFixed(3)}`;
  }

  private calculateCost(model: string, input: number, output: number): number {
    const key = Object.keys(MODEL_PRICING).find(k => model.includes(k));
    if (!key) return 0;
    const p = MODEL_PRICING[key];
    return (input / 1_000_000) * p.input + (output / 1_000_000) * p.output;
  }

  private normalizeModelName(model: string): string {
    return model.toLowerCase().split('/').pop() || model;
  }

  private createNewSession(): SessionStats {
    return {
      sessionId: Date.now().toString(36),
      date: this.todayDateStr(),
      model: '',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      messageCount: 0,
    };
  }

  private todayDateStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private ensureDir(): void {
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
  }

  private loadData(): void {
    if (fs.existsSync(STATS_FILE)) {
      try {
        this.data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      } catch {
        this.data = { sessions: [] };
      }
    }
  }

  private persistCurrentSession(): void {
    const others = this.data.sessions.filter(s => s.sessionId !== this.currentSession.sessionId);
    this.data.sessions = [...others, this.currentSession];
    try {
      fs.writeFileSync(STATS_FILE, JSON.stringify(this.data, null, 2));
    } catch {}
  }
}
