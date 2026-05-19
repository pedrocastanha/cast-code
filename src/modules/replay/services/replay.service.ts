import { Injectable, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReplayTraceRef, TraceEvent } from '../../trace/types/trace.types';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import { TraceReaderService } from '../../trace/services/trace-reader.service';
import { TraceExportFormat, TraceExportResult, TraceExportService } from '../../trace/services/trace-export.service';

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
  trace?: ReplayTraceRef;
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

export interface ReplayTimeline {
  session: ReplaySession | null;
  events: TraceEvent[];
  warning?: string;
}

export interface ReplayTraceFileExport extends TraceExportResult {
  filePath: string;
}

@Injectable()
export class ReplayService {
  private currentSession: ReplaySession;

  constructor(
    @Optional() private readonly traceContext?: TraceContextService,
    @Optional() private readonly traceWriter?: TraceWriterService,
    @Optional() private readonly traceReader?: TraceReaderService,
    @Optional() private readonly traceExporter?: TraceExportService,
  ) {
    fs.mkdirSync(this.getReplayDir(), { recursive: true });
    this.currentSession = this.createSession();
    this.startTrace();
  }

  recordEntry(entry: Omit<ReplayEntry, 'timestamp'>): void {
    this.currentSession.entries.push({ ...entry, timestamp: Date.now() });
    this.trace('session.message', {
      role: entry.role,
      toolName: entry.toolName,
      content: entry.content,
    });
    this.autoSave();
  }

  setModel(model: string): void {
    this.currentSession.model = model;
  }

  save(name: string): void {
    this.currentSession.name = name;
    this.syncTraceRef();
    const fileName = this.toReplayFileName(name);
    const filePath = path.join(this.getReplayDir(), fileName);
    fs.writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2));
  }

  saveSnapshot(name: string): SavedReplaySnapshot {
    this.currentSession.name = name;
    this.syncTraceRef();
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
    const fileName = name === 'current' || name === '_current'
      ? '_current'
      : name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const filePath = path.join(this.getReplayDir(), `${fileName}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  getTimeline(name: string): ReplayTimeline {
    const session = this.getSession(name);
    if (!session) {
      return { session: null, events: [], warning: `Session "${name}" not found.` };
    }
    if (!session.trace?.tracePath || !this.traceReader) {
      return { session, events: [], warning: 'No trace data recorded for this replay.' };
    }
    const events = this.traceReader.readTrace(session.trace.tracePath);
    return { session, events };
  }

  exportTrace(name: string, format: TraceExportFormat): TraceExportResult {
    const session = this.getSession(name);
    if (!session?.trace?.tracePath || !this.traceExporter) {
      return { format, content: '', events: 0 };
    }
    return this.traceExporter.exportTrace(session.trace.tracePath, format);
  }

  exportTraceToFile(name: string, format: TraceExportFormat): ReplayTraceFileExport {
    const result = this.exportTrace(name, format);
    const baseName = this.toReplayBaseName(name);
    const filePath = path.join(this.getReplayDir(), `${baseName}.trace.${format}`);
    if (result.events > 0) {
      fs.writeFileSync(filePath, result.content, 'utf-8');
    }
    return { ...result, filePath };
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
      this.syncTraceRef();
      fs.writeFileSync(path.join(replayDir, '_current.json'), JSON.stringify(this.currentSession, null, 2));
    } catch {}
  }

  private startTrace(): void {
    if (!this.traceContext || !this.traceWriter) {
      return;
    }
    const context = this.traceContext.startSession({
      project: this.currentSession.project,
      model: this.currentSession.model,
    });
    this.traceWriter.append({
      eventId: this.traceContext.nextEventId(),
      sessionId: context.sessionId,
      runId: context.rootRunId,
      type: 'session.started',
      payload: {
        project: this.currentSession.project,
        model: this.currentSession.model,
        replayId: this.currentSession.id,
      },
    });
    this.syncTraceRef();
  }

  private trace(type: TraceEvent['type'], payload: Record<string, unknown>): void {
    if (!this.traceContext || !this.traceWriter) {
      return;
    }
    const context = this.traceContext.getCurrent();
    this.traceWriter.append({
      eventId: this.traceContext.nextEventId(),
      sessionId: context.sessionId,
      runId: context.rootRunId,
      type,
      payload,
    });
    this.syncTraceRef();
  }

  private syncTraceRef(): void {
    if (!this.traceWriter) {
      return;
    }
    this.currentSession.trace = this.traceWriter.getCurrentTraceRef();
  }

  private getReplayDir(): string {
    return process.env.CAST_REPLAYS_DIR || path.join(os.homedir(), '.cast', 'replays');
  }

  private toReplayFileName(name: string): string {
    return `${this.toReplayBaseName(name)}.json`;
  }

  private toReplayBaseName(name: string): string {
    const fileName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    return fileName || 'session';
  }
}
