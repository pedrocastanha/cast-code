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

  test('memoryOverview reads the project memory overview endpoint', async () => {
    const originalFetch = global.fetch;
    let url = '';
    try {
      global.fetch = (async (input: string | URL | Request) => {
        url = String(input);
        return new Response(JSON.stringify({
          stats: { sources: 1, readySources: 1, units: 3, edges: 0, retrievalMode: 'vector' },
          sources: [{ title: 'Brand guide', status: 'ready', unitCount: 3 }],
          units: [],
          graph: { nodes: [], edges: [] },
        }), { status: 200 });
      }) as typeof fetch;

      const service = new PlatformClientService();
      const result = await service.memoryOverview(config, 'secret-key');

      assert.equal(url, 'https://api.cast.test/v1/projects/project-1/memory/overview');
      assert.equal(result.sources[0].title, 'Brand guide');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('markMemoryUsed posts retrieval usage without exposing api keys in body', async () => {
    const originalFetch = global.fetch;
    let url = '';
    let body = '';
    try {
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        url = String(input);
        body = String(init?.body);
        return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
      }) as typeof fetch;

      const service = new PlatformClientService();
      const result = await service.markMemoryUsed(config, 'secret-key', {
        retrievalId: 'ret-1',
        unitIds: ['11111111-1111-4111-8111-111111111111'],
      });

      assert.equal(url, 'https://api.cast.test/v1/projects/project-1/memory/usage');
      assert.deepEqual(JSON.parse(body), {
        retrievalId: 'ret-1',
        unitIds: ['11111111-1111-4111-8111-111111111111'],
      });
      assert.equal(result.accepted, 1);
      assert.doesNotMatch(body, /secret-key/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('benchmark sync methods use project benchmark routes and sanitized bodies', async () => {
    const originalFetch = global.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    try {
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(String(init?.body || '{}'), { status: 200 });
      }) as typeof fetch;

      const service = new PlatformClientService();
      await service.createBenchmarkDefinition(config, 'secret-key', {
        name: 'Benchmark',
        targetType: 'api_endpoint',
        targetRef: 'POST /chat',
        config: { target: { type: 'api_endpoint' } },
      });
      await service.createBenchmarkRun(config, 'secret-key', 'bench-1', {
        id: 'run-1',
        benchmarkId: 'bench-1',
        status: 'completed',
      });
      await service.appendBenchmarkResult(config, 'secret-key', 'run-1', {
        id: 'result-1',
        caseId: 'case-1',
        status: 'passed',
        outputPreview: 'ok',
      });
      await service.appendBenchmarkArtifact(config, 'secret-key', 'run-1', {
        kind: 'report',
        name: 'report.md',
        path: '.cast/benchmarks/run-1/report.md',
      });

      assert.equal(calls[0].url, 'https://api.cast.test/v1/projects/project-1/benchmarks');
      assert.equal(calls[1].url, 'https://api.cast.test/v1/projects/project-1/benchmarks/bench-1/runs');
      assert.equal(calls[2].url, 'https://api.cast.test/v1/projects/project-1/benchmark-runs/run-1/results');
      assert.equal(calls[3].url, 'https://api.cast.test/v1/projects/project-1/benchmark-runs/run-1/artifacts');
      assert.doesNotMatch(JSON.stringify(calls), /secret-key/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('schedule sync methods use project schedule routes and backend payload shape', async () => {
    const originalFetch = global.fetch;
    const calls: Array<{ url: string; method?: string; body: unknown }> = [];
    try {
      global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(input),
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify({ id: 'schedule-1' }), { status: 200 });
      }) as typeof fetch;

      const service = new PlatformClientService();
      await service.createSchedule(config, 'secret-key', {
        name: 'Nightly test health',
        cronExpression: '0 2 * * *',
        target: { type: 'benchmark', ref: 'bench-1', config: { definitionId: 'bench-1' } },
        budget: { maxUsd: 1, maxTokens: 1000, maxRuns: 1, maxRuntimeSeconds: 60 },
        approvalPolicy: { mode: 'read-only', allowShell: false, allowExternalMutation: false },
      });
      await service.updateSchedule(config, 'secret-key', 'schedule-1', {
        name: 'Nightly test health',
        cronExpression: '0 2 * * *',
        target: { type: 'benchmark', ref: 'bench-1', config: { definitionId: 'bench-1' } },
        status: 'paused',
      });
      await service.createScheduleRun(config, 'secret-key', 'schedule-1', {
        status: 'successful',
        summary: { ok: true },
        runConfig: { localRunId: 'local-run-1' },
      });

      assert.equal(calls[0].url, 'https://api.cast.test/v1/projects/project-1/schedules');
      assert.equal(calls[0].method, 'POST');
      assert.equal((calls[0].body as any).target.type, 'benchmark');
      assert.equal(calls[1].url, 'https://api.cast.test/v1/projects/project-1/schedules/schedule-1');
      assert.equal(calls[1].method, 'PATCH');
      assert.equal(calls[2].url, 'https://api.cast.test/v1/projects/project-1/schedules/schedule-1/runs');
      assert.equal(calls[2].method, 'POST');
      assert.equal((calls[2].body as any).status, 'successful');
      assert.doesNotMatch(JSON.stringify(calls), /secret-key/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
