import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const STATS_FILE = path.join(os.homedir(), '.cast', 'stats.json');

// Pricing per 1M tokens in USD (input / output)
// Keys are matched longest-first so more specific names win (e.g. gpt-4.1-mini before gpt-4).
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // ── OpenAI GPT-5 series ───────────────────────────────────────────
  'gpt-5-pro':          { input: 30.00, output: 180.00 },
  'gpt-5-mini':         { input: 0.125, output: 1.00  },
  'gpt-5':              { input: 2.50,  output: 15.00 },
  // ── OpenAI GPT-4.1 series ──────────────────────────────────────────
  'gpt-4.1-nano':       { input: 0.10,  output: 0.40  },
  'gpt-4.1-mini':       { input: 0.20,  output: 0.80  },
  'gpt-4.1':            { input: 2.00,  output: 8.00  },
  // ── OpenAI GPT-4o series ───────────────────────────────────────────
  'gpt-4o-mini':        { input: 0.15,  output: 0.60  },
  'gpt-4o':             { input: 2.50,  output: 10.00 },
  // ── OpenAI o-series (reasoning) ───────────────────────────────────
  'o4-mini':            { input: 1.10,  output: 4.40  },
  'o3-mini':            { input: 1.10,  output: 4.40  },
  'o3-pro':             { input: 20.00, output: 80.00 },
  'o3':                 { input: 2.00,  output: 8.00  },
  'o1-mini':            { input: 3.00,  output: 12.00 },
  'o1':                 { input: 15.00, output: 60.00 },
  // ── OpenAI legacy ─────────────────────────────────────────────────
  'gpt-4-turbo':        { input: 10.00, output: 30.00 },
  'gpt-4':              { input: 30.00, output: 60.00 },
  'gpt-3.5':            { input: 0.50,  output: 1.50  },
  // ── Anthropic Claude 4.6 ──────────────────────────────────────────
  'claude-opus-4-6':    { input: 5.00,  output: 25.00 },
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00 },
  // ── Anthropic Claude 4.x ──────────────────────────────────────────
  'claude-haiku-4-5':   { input: 1.00,  output: 5.00  },
  'claude-haiku-4':     { input: 1.00,  output: 5.00  },
  'claude-opus-4':      { input: 5.00,  output: 25.00 },
  'claude-sonnet-4':    { input: 3.00,  output: 15.00 },
  // ── Anthropic Claude 3.5 / 3 ──────────────────────────────────────
  'claude-3-5-sonnet':  { input: 3.00,  output: 15.00 },
  'claude-3-5-haiku':   { input: 0.80,  output: 4.00  },
  'claude-3-opus':      { input: 15.00, output: 75.00 },
  'claude-3-haiku':     { input: 0.25,  output: 1.25  },
  'claude-3-sonnet':    { input: 3.00,  output: 15.00 },
  // ── Google Gemini 3.x ─────────────────────────────────────────────
  'gemini-3.1-pro':     { input: 2.00,  output: 12.00 },
  'gemini-3-flash':     { input: 0.50,  output: 3.00  },
  'gemini-3':           { input: 2.00,  output: 12.00 },
  // ── Google Gemini 2.5 ─────────────────────────────────────────────
  'gemini-2.5-flash':   { input: 0.30,  output: 2.50  },
  'gemini-2.5-pro':     { input: 1.25,  output: 10.00 },
  // ── Google Gemini 2.0 / 1.5 ───────────────────────────────────────
  'gemini-2.0-flash':   { input: 0.10,  output: 0.40  },
  'gemini-2.0':         { input: 0.10,  output: 0.40  },
  'gemini-1.5-pro':     { input: 1.25,  output: 5.00  },
  'gemini-1.5-flash':   { input: 0.075, output: 0.30  },
  // ── Local / free ──────────────────────────────────────────────────
  'ollama':             { input: 0,     output: 0     },
  'local':              { input: 0,     output: 0     },
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

  setDefaultModel(model: string): void {
    if (!this.currentSession.model) {
      this.currentSession.model = this.normalizeModelName(model);
    }
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
    const key = Object.keys(MODEL_PRICING)
      .sort((a, b) => b.length - a.length)
      .find(k => model.includes(k));
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
