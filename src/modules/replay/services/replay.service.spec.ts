import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { ReplayService } from './replay.service';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceSanitizerService } from '../../trace/services/trace-sanitizer.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import { TraceReaderService } from '../../trace/services/trace-reader.service';
import { TraceExportService } from '../../trace/services/trace-export.service';

describe('ReplayService trace integration', () => {
  test('saves replay sessions with trace refs and renders timeline data', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cast-replay-trace-'));
    const previousReplayDir = process.env.CAST_REPLAYS_DIR;
    const previousTraceDir = process.env.CAST_TRACE_DIR;
    process.env.CAST_REPLAYS_DIR = path.join(root, 'replays');
    process.env.CAST_TRACE_DIR = path.join(root, 'traces');

    try {
      const context = new TraceContextService();
      const writer = new TraceWriterService(context, new TraceSanitizerService());
      const reader = new TraceReaderService();
      const replay = new ReplayService(context, writer, reader, new TraceExportService(reader));

      replay.recordEntry({ role: 'user', content: 'hello' });
      replay.recordEntry({ role: 'assistant', content: 'hi there' });
      replay.save('trace replay');

      const session = replay.getSession('trace replay');
      assert(session);
      assert.equal(session.trace?.schemaVersion, 1);
      assert.equal(session.trace?.events, 3);

      const timeline = replay.getTimeline('trace replay');
      assert.equal(timeline.events.length, 3);
      assert.deepEqual(timeline.events.map((event) => event.type), [
        'session.started',
        'session.message',
        'session.message',
      ]);

      const exported = replay.exportTrace('trace replay', 'jsonl');
      assert.match(exported.content, /session\.started/);
      assert.match(exported.content, /session\.message/);
      assert.equal(exported.events, 3);
    } finally {
      if (previousReplayDir === undefined) {
        delete process.env.CAST_REPLAYS_DIR;
      } else {
        process.env.CAST_REPLAYS_DIR = previousReplayDir;
      }
      if (previousTraceDir === undefined) {
        delete process.env.CAST_TRACE_DIR;
      } else {
        process.env.CAST_TRACE_DIR = previousTraceDir;
      }
    }
  });
});
