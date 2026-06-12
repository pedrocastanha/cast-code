import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SessionsCommandsService } from './session-commands.service';

const captureStdout = async (run: () => Promise<void>): Promise<string> => {
  const previousWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
    return output;
  } finally {
    process.stdout.write = previousWrite;
  }
};

const sessionSummary = {
  id: 'session-1',
  projectRoot: process.cwd(),
  startedAt: '2026-05-15T10:00:00.000Z',
  endedAt: '2026-05-15T10:20:00.000Z',
  model: 'gpt-test',
  totalTokens: 1234,
  totalCost: 0.01,
  messageCount: 2,
  toolCallCount: 1,
  lastActivityAt: '2026-05-15T10:19:00.000Z',
  preview: 'Implemented scheduler presets and session resume.',
};

describe('SessionsCommandsService', () => {
  test('search lists matching sessions with picker hint', async () => {
    const service = new SessionsCommandsService(
      {
        searchSessions: async () => [sessionSummary],
      } as any,
    );

    const output = await captureStdout(() => service.cmdSessions(['search', 'scheduler']));

    assert.match(output, /Sessions/);
    assert.match(output, /session-1/);
    assert.match(output, /scheduler presets/);
    assert.match(output, /\/resume/);
  });
});
