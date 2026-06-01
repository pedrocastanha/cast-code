import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ReplayCommandsService } from './replay-commands.service';
import { ReplayService } from '../../../replay/services/replay.service';
import { TraceContextService } from '../../../trace/services/trace-context.service';
import { TraceSanitizerService } from '../../../trace/services/trace-sanitizer.service';
import { TraceWriterService } from '../../../trace/services/trace-writer.service';
import { TraceReaderService } from '../../../trace/services/trace-reader.service';
import { TraceExportService } from '../../../trace/services/trace-export.service';

function captureStdout(run: () => void): string {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stdout.write;

  try {
    run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return output;
}

describe('ReplayCommandsService trace views', () => {
  test('renders timeline and exports trace data', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cast-replay-command-'));
    const previousReplayDir = process.env.CAST_REPLAYS_DIR;
    const previousTraceDir = process.env.CAST_TRACE_DIR;
    process.env.CAST_REPLAYS_DIR = path.join(root, 'replays');
    process.env.CAST_TRACE_DIR = path.join(root, 'traces');

    try {
      const context = new TraceContextService();
      const reader = new TraceReaderService();
      const replay = new ReplayService(
        context,
        new TraceWriterService(context, new TraceSanitizerService()),
        reader,
        new TraceExportService(reader),
      );
      const commands = new ReplayCommandsService(replay);

      replay.recordEntry({ role: 'user', content: 'inspect runtime' });
      replay.save('command trace');

      const timelineOutput = captureStdout(() => commands.cmdReplay('show command trace --timeline'));
      assert.match(timelineOutput, /TIMELINE/);
      assert.match(timelineOutput, /session\.started/);
      assert.match(timelineOutput, /session\.message/);

      const exportOutput = captureStdout(() => commands.cmdReplay('export command trace --format jsonl'));
      assert.match(exportOutput, /Exported/);
      assert.match(exportOutput, /events/);
      assert.match(exportOutput, /jsonl/);
      assert.equal(existsSync(path.join(process.env.CAST_REPLAYS_DIR!, 'command-trace.trace.jsonl')), true);
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
