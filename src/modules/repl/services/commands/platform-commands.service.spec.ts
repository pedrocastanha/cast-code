import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import { PlatformCommandsService } from './platform-commands.service';

function captureStdout(run: () => Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stdout.write;

  return run().then(
    () => output,
    (error) => {
      throw error;
    },
  ).finally(() => {
    process.stdout.write = originalWrite;
  });
}

describe('PlatformCommandsService', () => {
  test('cmdLink links the current working directory with direct flags', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'cast-link-command-'));
    const previousCwd = process.cwd();
    let captured: { projectRoot: string; options: Record<string, string | undefined> } | null = null;

    const service = new PlatformCommandsService(
      {
        link: async (root: string, options: Record<string, string | undefined>) => {
          captured = { projectRoot: root, options };
          return { ok: true, status: 'linked', message: 'Linked to "Demo" (0 skills, 0 agents).' };
        },
      } as any,
      {} as any,
      {} as any,
    );

    try {
      process.chdir(projectRoot);

      const output = await captureStdout(async () => {
        const linked = await service.cmdLink([
          '--project',
          'project-1',
          '--api-url',
          'http://localhost:3022',
          '--api-key-env',
          'CAST_API_KEY_DEV',
        ]);
        assert.equal(linked, true);
      });

      assert.deepEqual(captured, {
        projectRoot,
        options: {
          projectId: 'project-1',
          apiUrl: 'http://localhost:3022',
          apiKeyEnv: 'CAST_API_KEY_DEV',
        },
      });
      assert.match(output, /Linked to "Demo"/);
      assert.match(output, new RegExp(projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } finally {
      process.chdir(previousCwd);
    }
  });

  test('cmdLink status hides the platform key value', async () => {
    const service = new PlatformCommandsService(
      {} as any,
      {
        readConfig: async () => ({
          enabled: true,
          projectRoot: '/repo/app',
          projectId: 'project-1',
          apiUrl: 'https://api.cast.test',
          apiKeyEnv: 'CAST_API_KEY',
        }),
        getApiKey: () => 'secret-platform-key',
      } as any,
      {
        getStatus: () => 'online',
        getProject: () => ({ id: 'project-1', name: 'Demo Project' }),
        isRagEnabled: () => true,
      } as any,
    );

    const output = await captureStdout(async () => {
      const linked = await service.cmdLink(['status']);
      assert.equal(linked, false);
    });

    assert.match(output, /project-1/);
    assert.match(output, /Demo Project/);
    assert.match(output, /CAST_API_KEY/);
    assert.match(output, /present/i);
    assert.match(output, /RAG/i);
    assert.doesNotMatch(output, /secret-platform-key/);
  });

  test('interactive link treats a pasted API key as session env instead of apiKeyEnv', async () => {
    const previousKey = process.env.CAST_API_KEY;
    let captured: { options: Record<string, string | undefined>; envKey?: string } | null = null;
    const service = new PlatformCommandsService(
      {
        link: async (_root: string, options: Record<string, string | undefined>) => {
          captured = { options, envKey: process.env.CAST_API_KEY };
          return { ok: true, status: 'linked', message: 'Linked to "Demo" (0 skills, 0 agents).' };
        },
      } as any,
      {
        readConfig: async () => ({
          enabled: false,
          projectRoot: '/repo/app',
          apiUrl: 'http://localhost:3022',
          apiKeyEnv: 'CAST_API_KEY',
        }),
      } as any,
      {} as any,
    );
    const smartInput = {
      question: async (message: string) => {
        if (message.startsWith('Project ID')) return 'project-1';
        if (message.startsWith('Platform API URL')) return 'http://localhost:3022';
        if (message.startsWith('API key env')) return 'csk_session_key';
        return '';
      },
    };

    try {
      delete process.env.CAST_API_KEY;
      const output = await captureStdout(async () => {
        const linked = await service.cmdLink([], smartInput as any);
        assert.equal(linked, true);
      });

      assert.ok(captured);
      const result = captured as { options: Record<string, string | undefined>; envKey?: string };
      assert.equal(result.options.apiKeyEnv, 'CAST_API_KEY');
      assert.equal(result.envKey, 'csk_session_key');
      assert.doesNotMatch(output, /csk_session_key/);
    } finally {
      if (previousKey === undefined) delete process.env.CAST_API_KEY;
      else process.env.CAST_API_KEY = previousKey;
    }
  });
});
