import { Injectable } from '@nestjs/common';
import { TraceContext } from '../types/trace.types';

@Injectable()
export class TraceContextService {
  private current: TraceContext | null = null;
  private eventCounter = 0;
  private runCounter = 0;

  startSession(input: { project: string; model?: string }): TraceContext {
    if (this.current) {
      return this.current;
    }

    const sessionId = `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.current = {
      sessionId,
      rootRunId: `${sessionId}:root`,
      project: input.project,
      model: input.model,
      startedAt: new Date().toISOString(),
    };
    this.eventCounter = 0;
    this.runCounter = 0;
    return this.current;
  }

  ensureSession(input: { project: string; model?: string } = { project: process.cwd() }): TraceContext {
    return this.current ?? this.startSession(input);
  }

  getCurrent(): TraceContext {
    return this.ensureSession();
  }

  createChildRun(parentRunId: string, label: string): string {
    const context = this.getCurrent();
    this.runCounter += 1;
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'run';
    return `${context.sessionId}:${safeLabel}:${this.runCounter}`;
  }

  nextEventId(): string {
    const context = this.getCurrent();
    this.eventCounter += 1;
    return `${context.sessionId}:${this.eventCounter.toString().padStart(6, '0')}`;
  }
}
