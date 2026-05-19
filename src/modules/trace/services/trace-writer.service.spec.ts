import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { TraceContextService } from './trace-context.service';
import { TraceSanitizerService } from './trace-sanitizer.service';
import { TraceWriterService } from './trace-writer.service';
import { TraceReaderService } from './trace-reader.service';

describe('TraceWriterService', () => {
  test('writes sanitized local JSONL events with stable replay trace refs', async () => {
    const traceDir = await mkdtemp(path.join(os.tmpdir(), 'cast-trace-writer-'));
    const previousTraceDir = process.env.CAST_TRACE_DIR;
    process.env.CAST_TRACE_DIR = traceDir;

    try {
      const context = new TraceContextService();
      context.startSession({ project: '/repo', model: 'test/model' });
      const writer = new TraceWriterService(context, new TraceSanitizerService());
      const reader = new TraceReaderService();

      writer.append({
        eventId: context.nextEventId(),
        sessionId: context.getCurrent().sessionId,
        runId: context.getCurrent().rootRunId,
        type: 'tool.started',
        payload: {
          command: 'curl -H "Authorization: Bearer sk-test-secret" https://example.com',
          env: { OPENAI_API_KEY: 'sk-test-secret' },
        },
      });
      await writer.flush();

      const ref = writer.getCurrentTraceRef();
      assert.equal(ref.schemaVersion, 1);
      assert.equal(ref.events, 1);
      assert.match(ref.tracePath, /trace\.jsonl$/);

      const raw = await readFile(ref.tracePath, 'utf-8');
      assert.doesNotMatch(raw, /sk-test-secret/);
      assert.match(raw, /\[redacted:secret_pattern\]/);

      const events = reader.readTrace(ref.tracePath);
      assert.equal(events.length, 1);
      assert.equal(events[0].schemaVersion, 1);
      assert.equal(events[0].type, 'tool.started');
      assert.equal(events[0].redactions.length >= 2, true);
    } finally {
      if (previousTraceDir === undefined) {
        delete process.env.CAST_TRACE_DIR;
      } else {
        process.env.CAST_TRACE_DIR = previousTraceDir;
      }
    }
  });
});
