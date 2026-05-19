import { Injectable } from '@nestjs/common';
import { TraceEvent } from '../types/trace.types';
import { TraceReaderService } from './trace-reader.service';

export type TraceExportFormat = 'json' | 'jsonl';

export interface TraceExportResult {
  format: TraceExportFormat;
  content: string;
  events: number;
}

@Injectable()
export class TraceExportService {
  constructor(private readonly reader: TraceReaderService) {}

  exportTrace(tracePath: string, format: TraceExportFormat): TraceExportResult {
    const events = this.reader.readTrace(tracePath);
    return {
      format,
      events: events.length,
      content: format === 'json'
        ? JSON.stringify(events, null, 2)
        : events.map((event: TraceEvent) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : ''),
    };
  }
}
