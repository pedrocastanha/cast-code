import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SandboxCommandsService } from './sandbox-commands.service';

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

describe('SandboxCommandsService', () => {
  test('prints missing checkpoint message when rollback cannot restore a run', async () => {
    const service = new SandboxCommandsService(
      { rollback: async () => false } as any,
      { listCheckpoints: () => [] } as any,
    );

    const output = await captureStdout(() => service.cmdSandbox(['rollback', 'run-missing']));

    assert.match(output, /No restorable sandbox checkpoint found for: run-missing/);
  });

  test('lists recent sandbox checkpoints with file counts', async () => {
    const service = new SandboxCommandsService(
      { rollback: async () => true } as any,
      {
        listCheckpoints: () => [{
          checkpointId: 'run-1',
          timestamp: Date.parse('2026-05-11T10:00:00.000Z'),
          files: [{ filePath: 'a.ts' }, { filePath: 'b.ts' }],
        }],
      } as any,
    );

    const output = await captureStdout(() => service.cmdSandbox(['checkpoints']));

    assert.match(output, /Sandbox checkpoints:/);
    assert.match(output, /run-1 files=2 at=2026-05-11T10:00:00.000Z/);
  });
});
