import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { StateDbService } from '../../state/services/state-db.service';
import { BenchmarkStoreService } from './benchmark-store.service';
import type { BenchmarkDefinition, BenchmarkResult } from '../types/benchmark.types';

const withStore = async (run: (store: BenchmarkStoreService, db: StateDbService, root: string) => Promise<void>) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cast-benchmark-store-'));
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(tempDir, 'state.db');
  const db = new StateDbService();
  const store = new BenchmarkStoreService(db);

  try {
    await run(store, db, tempDir);
  } finally {
    await db.close();
    if (previousDb === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousDb;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
};

const fixtureDefinition = (projectRoot: string): BenchmarkDefinition => ({
  id: 'bench-1',
  projectRoot,
  name: 'Local smoke',
  description: 'A deterministic benchmark',
  target: { type: 'model_prompt', config: { staticOutput: 'hello cast' } },
  cases: [
    { id: 'case-1', input: 'Say hello', expected: 'hello' },
    { id: 'case-2', input: 'Say cast', expected: 'cast' },
  ],
  graders: [
    { id: 'contains-expected', type: 'string_check', config: { mode: 'contains' } },
  ],
  createdAt: '2026-05-08T00:00:00.000Z',
  updatedAt: '2026-05-08T00:00:00.000Z',
});

describe('BenchmarkStoreService', () => {
  test('creates benchmark tables through local state migrations', async () => {
    await withStore(async (_store, db) => {
      const database = await db.getDb();
      const tables = database.prepare('select name from sqlite_master where type in (\'table\', \'virtual\') order by name').all()
        .map((row: any) => row.name);

      assert(tables.includes('benchmark_definitions'));
      assert(tables.includes('benchmark_cases'));
      assert(tables.includes('benchmark_runs'));
      assert(tables.includes('benchmark_results'));
      assert(tables.includes('benchmark_results_fts'));
    });
  });

  test('saves, lists, and gets benchmark definitions by project root', async () => {
    await withStore(async (store, _db, projectRoot) => {
      const saved = await store.saveDefinition(fixtureDefinition(projectRoot));

      assert.equal(saved.id, 'bench-1');
      const listed = await store.listDefinitions(projectRoot);
      assert.equal(listed.length, 1);
      assert.equal(listed[0].cases.length, 2);
      assert.equal(listed[0].target.type, 'model_prompt');

      const found = await store.getDefinition('bench-1');
      assert.equal(found?.name, 'Local smoke');
      assert.equal(found?.cases[1].expected, 'cast');
      assert.equal(await store.getDefinition('missing'), null);
    });
  });

  test('creates runs, appends results, and completes with summary', async () => {
    await withStore(async (store, _db, projectRoot) => {
      await store.saveDefinition(fixtureDefinition(projectRoot));
      const run = await store.createRun({
        definitionId: 'bench-1',
        projectRoot,
        definitionSnapshot: fixtureDefinition(projectRoot),
      });

      const result: BenchmarkResult = {
        id: 'result-1',
        runId: run.id,
        caseId: 'case-1',
        status: 'passed',
        input: 'Say hello',
        output: 'hello cast',
        expected: 'hello',
        scores: [{ graderId: 'contains-expected', type: 'string_check', passed: true, score: 1, reason: 'matched' }],
        score: 1,
        cost: 0.02,
        tokens: 10,
        latencyMs: 42,
        startedAt: '2026-05-08T00:00:00.000Z',
        completedAt: '2026-05-08T00:00:01.000Z',
      };

      await store.updateRunStatus(run.id, 'running');
      await store.appendResult(run.id, result);
      await store.completeRun(run.id, {
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        passRate: 1,
        score: 1,
        totalCost: 0.02,
        totalTokens: 10,
        latencyP50Ms: 42,
        latencyP95Ms: 42,
      });

      const completed = await store.getRun(run.id);
      assert.equal(completed?.status, 'completed');
      assert.equal(completed?.summary?.totalCost, 0.02);

      const results = await store.listResults(run.id);
      assert.equal(results.length, 1);
      assert.equal(results[0].output, 'hello cast');
    });
  });
});
