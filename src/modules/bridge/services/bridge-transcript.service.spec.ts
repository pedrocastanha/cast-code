import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { BridgeTranscriptService } from './bridge-transcript.service';

describe('BridgeTranscriptService', () => {
  test('writes redacted jsonl transcript events under .cast/bridge', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cast-bridge-transcript-'));
    try {
      const service = new BridgeTranscriptService({
        redact: (value: unknown) => String(value).replace(/sk-[a-z0-9]+/i, '[REDACTED]'),
      } as any);

      const transcriptPath = await service.append(root, {
        id: 'evt_1',
        sessionId: 'sess_1',
        createdAt: '2026-05-19T00:00:00.000Z',
        direction: 'to_provider',
        provider: 'claude',
        redactedText: 'secret sk-test123',
      });

      const text = readFileSync(transcriptPath, 'utf8');
      assert.match(text, /evt_1/);
      assert.match(text, /\[REDACTED\]/);
      assert.doesNotMatch(text, /sk-test123/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
