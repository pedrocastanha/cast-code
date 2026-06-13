import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GitCommandsService } from './git-commands.service';

async function captureStdout(run: () => Promise<unknown>): Promise<string> {
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

test('cmdSplitUp reports provider errors without throwing out of the CLI', async () => {
  const service = new GitCommandsService(
    {
      hasChanges: () => true,
      splitCommits: async () => {
        const error = new Error('429 Provider returned error') as Error & { status?: number; error?: any };
        error.status = 429;
        error.error = {
          metadata: {
            raw: 'moonshotai/kimi-k2.6:free is temporarily rate-limited upstream.',
          },
        };
        throw error;
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const output = await captureStdout(() => service.cmdSplitUp({} as any));

  assert.match(output, /Failed to split commits/i);
  assert.match(output, /rate-limited/i);
});
