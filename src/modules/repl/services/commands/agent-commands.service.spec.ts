import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AgentCommandsService } from './agent-commands.service';

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stdout.write;

  try {
    await run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return output;
}

describe('AgentCommandsService skills import routing', () => {
  test('routes /skills import-hermes to the import command service', async () => {
    const calls: string[][] = [];
    const service = new AgentCommandsService(
      { resolveAllAgents: () => [] } as any,
      { getAllSkills: () => [] } as any,
      {
        handle: async (args: string[]) => {
          calls.push(args);
          return { ok: true, message: 'import summary' };
        },
      } as any,
    );

    const output = await captureStdout(() => service.cmdSkills(['import-hermes', '/tmp/hermes-agent', '--dry-run'], {} as any));

    assert.deepEqual(calls, [['import-hermes', '/tmp/hermes-agent', '--dry-run']]);
    assert.match(output, /import summary/);
  });
});
