import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PlatformClientError, PlatformClientService } from './platform-client.service';
import { PlatformConfig } from '../types';

const config: PlatformConfig = {
  enabled: true,
  projectRoot: '/tmp/project',
  projectId: 'project-1',
  apiKeyEnv: 'CAST_API_KEY',
  apiUrl: 'https://api.cast.test/',
};

describe('PlatformClientService', () => {
  test('authMe sends bearer authorization header', async () => {
    const originalFetch = global.fetch;
    let authHeader = '';
    try {
      global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        authHeader = String((init?.headers as Record<string, string>).Authorization);
        return new Response(JSON.stringify({ userId: 'u1' }), { status: 200 });
      }) as typeof fetch;

      const service = new PlatformClientService();
      await service.authMe(config, 'secret-key');

      assert.equal(authHeader, 'Bearer secret-key');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('getProject returns parsed project json', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = (async () =>
        new Response(
          JSON.stringify({
            project: { id: 'project-1', name: 'Project' },
            features: { remoteAgents: true, benchAccess: false, maxSkills: 5 },
            skills: [],
            agents: [],
          }),
          { status: 200 },
        )) as typeof fetch;

      const service = new PlatformClientService();
      const project = await service.getProject(config, 'secret-key');

      assert.equal(project.project.id, 'project-1');
      assert.equal(project.features.maxSkills, 5);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('timeout errors are typed and do not include api keys', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        await new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted secret-key'), { name: 'AbortError' })),
          );
        });
        throw new Error('unreachable');
      }) as typeof fetch;

      const service = new PlatformClientService();
      await assert.rejects(
        () => service.authMe(config, 'secret-key', 1),
        (error) => {
          assert(error instanceof PlatformClientError);
          assert.doesNotMatch(error.message, /secret-key/);
          assert.equal(error.code, 'timeout');
          return true;
        },
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('postEvents sends only event json body', async () => {
    const originalFetch = global.fetch;
    let body = '';
    try {
      global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        body = String(init?.body);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch;

      const service = new PlatformClientService();
      await service.postEvents(config, 'secret-key', 'session-1', [
        { type: 'command.run', payload: { command: '/help' }, ts: '2026-04-29T12:00:00.000Z' },
      ]);

      assert.deepEqual(JSON.parse(body), {
        events: [
          { type: 'command.run', payload: { command: '/help' }, ts: '2026-04-29T12:00:00.000Z' },
        ],
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('retrieveMemory posts query to project memory endpoint', async () => {
    const originalFetch = global.fetch;
    let url = '';
    let body = '';
    try {
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        url = String(input);
        body = String(init?.body);
        return new Response(JSON.stringify({
          results: [{ unitId: 'unit-1', content: 'Use bearer tokens.', score: 0.9, related: [] }],
        }), { status: 200 });
      }) as typeof fetch;

      const service = new PlatformClientService();
      const result = await service.retrieveMemory(config, 'secret-key', {
        query: 'auth',
        topK: 3,
      });

      assert.equal(url, 'https://api.cast.test/v1/projects/project-1/memory/retrieve');
      assert.deepEqual(JSON.parse(body), { query: 'auth', topK: 3 });
      assert.equal(result.results[0].unitId, 'unit-1');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
