import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { TraceEvent } from '../types/trace.types';

@Injectable()
export class TraceReaderService {
  readTrace(tracePath: string): TraceEvent[] {
    if (!tracePath || !fs.existsSync(tracePath)) {
      return [];
    }

    const lines = fs.readFileSync(tracePath, 'utf-8').split(/\r?\n/).filter(Boolean);
    const events: TraceEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as TraceEvent);
      } catch {
        continue;
      }
    }
    return events.sort((a, b) => a.eventId.localeCompare(b.eventId));
  }
}
