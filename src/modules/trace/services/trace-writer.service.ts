import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ReplayTraceRef, TraceEvent, TraceEventType } from '../types/trace.types';
import { TraceContextService } from './trace-context.service';
import { TraceSanitizerService } from './trace-sanitizer.service';

type TraceAppendInput<TPayload extends Record<string, unknown>> = {
  eventId: string;
  sessionId: string;
  runId: string;
  parentRunId?: string;
  type: TraceEventType;
  payload: TPayload;
};

@Injectable()
export class TraceWriterService {
  private tracePath: string | null = null;
  private events = 0;

  constructor(
    private readonly context: TraceContextService,
    private readonly sanitizer: TraceSanitizerService,
  ) {}

  append<TPayload extends Record<string, unknown>>(input: TraceAppendInput<TPayload>): void {
    try {
      const sanitized = this.sanitizer.sanitize(input.payload);
      const event: TraceEvent<TPayload> = {
        schemaVersion: 1,
        eventId: input.eventId,
        sessionId: input.sessionId,
        runId: input.runId,
        parentRunId: input.parentRunId,
        timestamp: new Date().toISOString(),
        type: input.type,
        payload: sanitized.payload,
        redactions: sanitized.redactions,
      };

      fs.mkdirSync(path.dirname(this.getTracePath()), { recursive: true, mode: 0o700 });
      fs.appendFileSync(this.getTracePath(), `${JSON.stringify(event)}\n`, 'utf-8');
      this.events += 1;
    } catch (error) {
      process.stderr.write(`[warn] trace write failed: ${(error as Error).message}\n`);
    }
  }

  async flush(): Promise<void> {
    return;
  }

  getCurrentTraceRef(): ReplayTraceRef {
    const context = this.context.getCurrent();
    return {
      schemaVersion: 1,
      sessionId: context.sessionId,
      rootRunId: context.rootRunId,
      tracePath: this.getTracePath(),
      events: this.events,
    };
  }

  private getTracePath(): string {
    if (this.tracePath) {
      return this.tracePath;
    }

    const context = this.context.getCurrent();
    const root = process.env.CAST_TRACE_DIR
      || path.join(process.env.CAST_REPLAYS_DIR || path.join(os.homedir(), '.cast', 'replays'), 'traces');
    this.tracePath = path.join(root, context.sessionId, 'trace.jsonl');
    return this.tracePath;
  }
}
