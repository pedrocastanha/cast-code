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
  test('cmdPlatform configures global credentials, writes project manifest, and bootstraps remote context', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'cast-link-command-'));
    const previousCwd = process.cwd();
    const calls: Array<{ type: string; value?: unknown }> = [];

    const service = new PlatformCommandsService(
      {} as any,
      {
        readConfig: async () => ({
          enabled: false,
          projectRoot,
          apiUrl: 'http://localhost:3022',
          apiKeyEnv: 'CAST_API_KEY',
        }),
        writeLink: async (root: string, options: Record<string, string | undefined>) => {
          calls.push({ type: 'writeLink', value: { root, options } });
        },
        getApiKey: () => 'csk_configured_key',
      } as any,
      {
        bootstrap: async (root: string) => {
          calls.push({ type: 'bootstrap', value: root });
          return {
            status: 'online',
            project: { id: 'project-1', name: 'Demo' },
            skills: [{ name: 'document-writer' }, { name: 'visual-qa' }],
            agents: [{ role: 'reviewer' }],
            mcp: [],
            features: { remoteAgents: true, benchAccess: true, maxSkills: 200 },
          };
        },
      } as any,
      {
        loadConfig: async () => ({
          platform: {
            apiUrl: 'http://localhost:3001',
            apiKey: 'csk_existing_global_key',
          },
        }),
        getConfig: () => ({
          platform: {
            apiUrl: 'http://localhost:3001',
            apiKey: 'csk_existing_global_key',
          },
        }),
        setPlatformConfig: async (platform: Record<string, string>) => {
          calls.push({ type: 'setPlatformConfig', value: platform });
        },
      } as any,
    );
    const smartInput = {
      question: async (message: string) => {
        if (message.startsWith('Project ID')) return 'project-1';
        if (message.startsWith('Platform API URL')) return 'http://localhost:3001';
        if (message.startsWith('Platform API key')) return 'csk_new_global_key';
        return '';
      },
    };

    try {
      process.chdir(projectRoot);

      const output = await captureStdout(async () => {
        const configured = await service.cmdPlatform([], smartInput as any);
        assert.equal(configured, true);
      });

      assert.deepEqual(calls[0], {
        type: 'setPlatformConfig',
        value: {
          apiUrl: 'http://localhost:3001',
          apiKey: 'csk_new_global_key',
        },
      });
      assert.deepEqual(calls[1], {
        type: 'writeLink',
        value: {
          root: projectRoot,
          options: {
            projectId: 'project-1',
            apiUrl: 'http://localhost:3001',
            apiKeyEnv: 'CAST_API_KEY',
          },
        },
      });
      assert.deepEqual(calls[2], { type: 'bootstrap', value: projectRoot });
      assert.match(output, /Platform configured/i);
      assert.match(output, /Demo/);
      assert.match(output, new RegExp(projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(output, /csk_new_global_key/);
    } finally {
      process.chdir(previousCwd);
    }
  });

  test('cmdPlatform supports direct flags without asking for an api key env', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'cast-platform-direct-'));
    const previousCwd = process.cwd();
    let captured: Record<string, unknown> | null = null;

    const service = new PlatformCommandsService(
      {} as any,
      {
        readConfig: async () => ({
          enabled: false,
          projectRoot,
          apiUrl: 'http://localhost:3022',
          apiKeyEnv: 'CAST_API_KEY',
        }),
        writeLink: async (root: string, options: Record<string, string | undefined>) => {
          captured = { root, options };
        },
        getApiKey: () => 'csk_global_key',
      } as any,
      {
        bootstrap: async () => ({
          status: 'online',
          project: { id: 'project-1', name: 'Demo' },
          skills: [],
          agents: [],
          mcp: [],
        }),
      } as any,
      {
        loadConfig: async () => ({ platform: {} }),
        getConfig: () => ({ platform: {} }),
        setPlatformConfig: async () => {},
      } as any,
    );

    try {
      process.chdir(projectRoot);
      await captureStdout(async () => {
        const configured = await service.cmdPlatform([
          '--project',
          'project-1',
          '--api-url',
          'http://localhost:3001',
        ]);
        assert.equal(configured, true);
      });

      assert.deepEqual(captured, {
        root: projectRoot,
        options: {
          projectId: 'project-1',
          apiUrl: 'http://localhost:3001',
          apiKeyEnv: 'CAST_API_KEY',
        },
      });
    } finally {
      process.chdir(previousCwd);
    }
  });

  test('cmdPlatform status hides the platform key value', async () => {
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
        bootstrap: async () => ({ status: 'online' }),
        getStatus: () => 'online',
        getProject: () => ({ id: 'project-1', name: 'Demo Project' }),
        isRagEnabled: () => true,
      } as any,
      {
        loadConfig: async () => ({
          platform: { apiKey: 'secret-platform-key', apiUrl: 'https://api.cast.test' },
        }),
        getConfig: () => ({
          platform: { apiKey: 'secret-platform-key', apiUrl: 'https://api.cast.test' },
        }),
      } as any,
    );

    const output = await captureStdout(async () => {
      const linked = await service.cmdPlatform(['status']);
      assert.equal(linked, false);
    });

    assert.match(output, /project-1/);
    assert.match(output, /Demo Project/);
    assert.match(output, /CAST_API_KEY/);
    assert.match(output, /present/i);
    assert.match(output, /RAG/i);
    assert.doesNotMatch(output, /secret-platform-key/);
  });
});
