import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { PlatformClientError, PlatformClientService } from '../../platform/services/platform-client.service';
import { PlatformConfigService } from '../../platform/services/platform-config.service';
import type { BenchmarkDefinition, BenchmarkResult, BenchmarkRun } from '../types';
import { BenchmarkPlatformSyncService } from './benchmark-platform-sync.service';
import { BenchmarkStoreService } from './benchmark-store.service';

const definition = (projectRoot: string): BenchmarkDefinition => ({
  id: 'bench-1',
  projectRoot,
  name: 'API benchmark',
  target: { type: 'api_endpoint', config: { method: 'POST', url: 'http://localhost:3000/chat' } },
  cases: [{ id: 'case-1', input: 'hello', expected: 'world' }],
  graders: [{ id: 'contains-world', type: 'string_check', config: { value: 'world' } }],
  createdAt: '2026-05-08T00:00:00.000Z',
  updatedAt: '2026-05-08T00:00:00.000Z',
});

const run = (projectRoot: string): BenchmarkRun => ({
  id: 'run-1',
  definitionId: 'bench-1',
  projectRoot,
  status: 'completed',
  startedAt: '2026-05-08T00:00:00.000Z',
  completedAt: '2026-05-08T00:00:01.000Z',
  artifactDir: join(projectRoot, '.cast', 'benchmarks', 'run-1'),
  summary: {
    totalCases: 1,
    passedCases: 1,
    failedCases: 0,
    passRate: 1,
    score: 1,
    totalCost: 0,
    totalTokens: 12,
    latencyP50Ms: 10,
    latencyP95Ms: 10,
  },
});

test('syncCompletedRun posts definition, run, result previews, and artifact metadata', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-platform-sync-'));
  const previousKey = process.env.CAST_API_KEY;
  process.env.CAST_API_KEY = 'secret-key';
  await mkdir(join(projectRoot, '.cast'), { recursive: true });
  await writeFile(join(projectRoot, '.cast', 'cast.yaml'), [
    'version: 1',
    'platform:',
    '  projectId: project-1',
    '  apiUrl: http://localhost:3022',
    '  apiKeyEnv: CAST_API_KEY',
  ].join('\n'));

  const def = definition(projectRoot);
  const result: BenchmarkResult = {
    id: 'result-1',
    runId: 'run-1',
    caseId: 'case-1',
    status: 'passed',
    input: 'hello raw input kept local',
    output: 'world'.repeat(200),
    expected: 'world',
    scores: [{ graderId: 'contains-world', type: 'string_check', passed: true, score: 1, reason: 'ok' }],
    score: 1,
    cost: 0,
    tokens: 12,
    latencyMs: 10,
    startedAt: '2026-05-08T00:00:00.000Z',
    completedAt: '2026-05-08T00:00:01.000Z',
  };
  const store = {
    listResults: async () => [result],
  } as unknown as BenchmarkStoreService;

  const posted: Array<{ kind: string; body: any }> = [];
  const client = {
    createBenchmarkDefinition: async (_config: unknown, _apiKey: string, body: any) => {
      posted.push({ kind: 'definition', body });
      return {
        definition: { ...body, id: '22222222-2222-4222-8222-222222222222' },
        cases: [{ id: '44444444-4444-4444-8444-444444444444', input: { value: 'hello' } }],
      };
    },
    createBenchmarkRun: async (_config: unknown, _apiKey: string, _benchmarkId: string, body: any) => {
      posted.push({ kind: 'run', body });
      return { ...body, id: '33333333-3333-4333-8333-333333333333' };
    },
    appendBenchmarkResult: async (_config: unknown, _apiKey: string, _runId: string, body: unknown) => {
      posted.push({ kind: 'result', body });
      return body;
    },
    appendBenchmarkArtifact: async (_config: unknown, _apiKey: string, _runId: string, body: unknown) => {
      posted.push({ kind: 'artifact', body });
      return body;
    },
  } as unknown as PlatformClientService;

  try {
    const service = new BenchmarkPlatformSyncService(new PlatformConfigService(), client, store);
    const sync = await service.syncCompletedRun(def, run(projectRoot));

    assert.equal(sync.status, 'synced');
    assert.equal(sync.webUrl, 'http://localhost:3003/projects/project-1/benchmarks/33333333-3333-4333-8333-333333333333');
    assert.deepEqual(posted.map((item) => item.kind), ['definition', 'run', 'result', 'artifact', 'artifact', 'artifact', 'artifact']);
    assert.equal(posted.find((item) => item.kind === 'result')?.body.output, undefined);
    assert.equal(posted.find((item) => item.kind === 'result')?.body.input, undefined);
    assert.equal(posted.find((item) => item.kind === 'result')?.body.caseId, '44444444-4444-4444-8444-444444444444');
    assert(String(posted.find((item) => item.kind === 'result')?.body.outputPreview).length <= 500);
    const postedRun = posted.find((item) => item.kind === 'run')?.body;
    assert.equal(postedRun.runConfig.artifactDir, '.cast/benchmarks/run-1');
    assert.equal(String(postedRun.runConfig.artifactDir).includes(projectRoot), false);
    const artifactPaths = posted.filter((item) => item.kind === 'artifact').map((item) => String(item.body.path));
    assert.equal(artifactPaths.includes('.cast/benchmarks/run-1/report.md'), true);
    assert.equal(artifactPaths.some((artifactPath) => artifactPath.includes(projectRoot)), false);
  } finally {
    if (previousKey === undefined) delete process.env.CAST_API_KEY;
    else process.env.CAST_API_KEY = previousKey;
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('syncCompletedRun maps remote cases by localCaseId when backend response order changes', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-platform-sync-case-map-'));
  const previousKey = process.env.CAST_API_KEY;
  process.env.CAST_API_KEY = 'secret-key';
  await mkdir(join(projectRoot, '.cast'), { recursive: true });
  await writeFile(join(projectRoot, '.cast', 'cast.yaml'), [
    'version: 1',
    'platform:',
    '  projectId: project-1',
    '  apiUrl: http://localhost:3022',
    '  apiKeyEnv: CAST_API_KEY',
  ].join('\n'));

  const def: BenchmarkDefinition = {
    ...definition(projectRoot),
    cases: [
      { id: 'case-a', input: 'first', expected: 'ok' },
      { id: 'case-b', input: 'second', expected: 'ok' },
    ],
  };
  const result: BenchmarkResult = {
    id: 'result-1',
    runId: 'run-1',
    caseId: 'case-b',
    status: 'passed',
    input: 'second',
    output: 'ok',
    expected: 'ok',
    scores: [],
    score: 1,
    cost: 0,
    tokens: 1,
    latencyMs: 5,
    startedAt: '2026-05-08T00:00:00.000Z',
    completedAt: '2026-05-08T00:00:01.000Z',
  };
  const store = {
    listResults: async () => [result],
  } as unknown as BenchmarkStoreService;

  let postedResult: any;
  const client = {
    createBenchmarkDefinition: async (_config: unknown, _apiKey: string, body: any) => ({
      definition: { ...body, id: '22222222-2222-4222-8222-222222222222' },
      cases: [
        { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', input: { value: 'second' }, rubric: { localCaseId: 'case-b' } },
        { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', input: { value: 'first' }, rubric: { localCaseId: 'case-a' } },
      ],
    }),
    createBenchmarkRun: async (_config: unknown, _apiKey: string, _benchmarkId: string, body: any) => ({
      ...body,
      id: '33333333-3333-4333-8333-333333333333',
    }),
    appendBenchmarkResult: async (_config: unknown, _apiKey: string, _runId: string, body: unknown) => {
      postedResult = body;
      return body;
    },
    appendBenchmarkArtifact: async (_config: unknown, _apiKey: string, _runId: string, body: unknown) => body,
  } as unknown as PlatformClientService;

  try {
    const service = new BenchmarkPlatformSyncService(new PlatformConfigService(), client, store);
    const testRun = { ...run(projectRoot), artifactDir: undefined };
    const sync = await service.syncCompletedRun(def, testRun);

    assert.equal(sync.status, 'synced');
    assert.equal(postedResult.caseId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  } finally {
    if (previousKey === undefined) delete process.env.CAST_API_KEY;
    else process.env.CAST_API_KEY = previousKey;
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('getWebRunUrl returns null for linked projects without a remote run mapping', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-platform-open-fallback-'));
  const previousKey = process.env.CAST_API_KEY;
  process.env.CAST_API_KEY = 'secret-key';
  await mkdir(join(projectRoot, '.cast'), { recursive: true });
  await writeFile(join(projectRoot, '.cast', 'cast.yaml'), [
    'version: 1',
    'platform:',
    '  projectId: project-1',
    '  apiUrl: http://localhost:3022',
    '  apiKeyEnv: CAST_API_KEY',
  ].join('\n'));

  const client = {} as unknown as PlatformClientService;
  const store = {
    listResults: async () => [],
  } as unknown as BenchmarkStoreService;

  try {
    const service = new BenchmarkPlatformSyncService(new PlatformConfigService(), client, store);
    assert.equal(await service.getWebRunUrl(projectRoot, 'run-1'), null);
  } finally {
    if (previousKey === undefined) delete process.env.CAST_API_KEY;
    else process.env.CAST_API_KEY = previousKey;
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('sync queues failures without failing local benchmark flow', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-platform-sync-fail-'));
  const previousKey = process.env.CAST_API_KEY;
  process.env.CAST_API_KEY = 'secret-key';
  await mkdir(join(projectRoot, '.cast'), { recursive: true });
  await writeFile(join(projectRoot, '.cast', 'cast.yaml'), [
    'version: 1',
    'platform:',
    '  projectId: project-1',
    '  apiUrl: http://localhost:3022',
    '  apiKeyEnv: CAST_API_KEY',
  ].join('\n'));

  const client = {
    createBenchmarkDefinition: async () => {
      throw new PlatformClientError('offline', 'network');
    },
  } as unknown as PlatformClientService;
  const store = {
    listResults: async () => [],
  } as unknown as BenchmarkStoreService;

  try {
    const service = new BenchmarkPlatformSyncService(new PlatformConfigService(), client, store);
    const result = await service.syncDefinition(definition(projectRoot));
    const pending = JSON.parse(await readFile(join(projectRoot, '.cast', 'platform.pending-benchmark-sync.json'), 'utf-8'));

    assert.equal(result.status, 'queued');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].definition.name, 'API benchmark');
  } finally {
    if (previousKey === undefined) delete process.env.CAST_API_KEY;
    else process.env.CAST_API_KEY = previousKey;
    await rm(projectRoot, { recursive: true, force: true });
  }
});
