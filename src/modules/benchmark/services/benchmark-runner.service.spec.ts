import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { StateDbService } from '../../state/services/state-db.service';
import { StateRedactionService } from '../../state/services/state-redaction.service';
import { BenchmarkArtifactService } from './benchmark-artifact.service';
import { BenchmarkCostService } from './benchmark-cost.service';
import { BenchmarkGraderService } from './benchmark-grader.service';
import { BenchmarkRunnerService } from './benchmark-runner.service';
import { BenchmarkStoreService } from './benchmark-store.service';
import { BenchmarkTargetService } from './benchmark-target.service';
import type { BenchmarkDefinition } from '../types/benchmark.types';

const withRunner = async (
  targetService: BenchmarkTargetService,
  run: (input: { runner: BenchmarkRunnerService; store: BenchmarkStoreService; projectRoot: string }) => Promise<void>,
) => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-runner-'));
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(projectRoot, 'state.db');
  const db = new StateDbService();
  const store = new BenchmarkStoreService(db);
  const cost = new BenchmarkCostService();
  const runner = new BenchmarkRunnerService(
    store,
    new BenchmarkArtifactService(new StateRedactionService()),
    new BenchmarkGraderService(undefined as any, cost),
    cost,
    targetService,
  );

  try {
    await run({ runner, store, projectRoot });
  } finally {
    await db.close();
    if (previousDb === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousDb;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
};

const definition = (projectRoot: string): BenchmarkDefinition => ({
  id: 'bench-1',
  projectRoot,
  name: 'Runner smoke',
  target: { type: 'model_prompt', config: { staticOutput: '{{input}} ok' } },
  cases: [
    { id: 'case-1', input: 'first', expected: 'ok' },
    { id: 'case-2', input: 'second', expected: 'ok' },
  ],
  graders: [{ id: 'contains-expected', type: 'string_check', config: { mode: 'contains' } }],
  budget: { maxCostUsd: 1, maxTokens: 1000, maxCases: 10 },
  createdAt: '2026-05-08T00:00:00.000Z',
  updatedAt: '2026-05-08T00:00:00.000Z',
});

describe('BenchmarkRunnerService', () => {
  test('runs cases sequentially, persists results, and writes summary artifacts', async () => {
    await withRunner(new BenchmarkTargetService(undefined as any), async ({ runner, store, projectRoot }) => {
      const run = await runner.runDefinition(definition(projectRoot));

      assert.equal(run.status, 'completed');
      assert.equal(run.summary?.totalCases, 2);
      assert.equal(run.summary?.passedCases, 2);
      assert.equal(run.summary?.latencyP50Ms !== undefined, true);
      assert.match(run.artifactDir ?? '', /\.cast\/benchmarks\/.+/);

      const results = await store.listResults(run.id);
      assert.equal(results.length, 2);
      assert.equal(results[0].status, 'passed');
    });
  });

  test('records target failures as failed case results without losing artifacts', async () => {
    const target = {
      execute: async () => {
        throw new Error('target exploded');
      },
    } as unknown as BenchmarkTargetService;

    await withRunner(target, async ({ runner, store, projectRoot }) => {
      const run = await runner.runDefinition(definition(projectRoot));

      assert.equal(run.status, 'completed');
      assert.equal(run.summary?.failedCases, 2);
      const results = await store.listResults(run.id);
      assert.equal(results[0].status, 'error');
      assert.match(results[0].error ?? '', /target exploded/);
    });
  });

  test('stops before running cases when budget is already exceeded', async () => {
    await withRunner(new BenchmarkTargetService(undefined as any), async ({ runner, projectRoot }) => {
      const run = await runner.runDefinition({
        ...definition(projectRoot),
        budget: { maxCases: 0 },
      });

      assert.equal(run.status, 'failed');
      assert.match(run.error ?? '', /budget/i);
      assert.equal(run.summary?.totalCases, 0);
    });
  });

  test('uses the store-normalized definition id when creating a run', async () => {
    await withRunner(new BenchmarkTargetService(undefined as any), async ({ runner, store, projectRoot }) => {
      const run = await runner.runDefinition({
        ...definition(projectRoot),
        id: '',
      });

      assert.equal(run.status, 'completed');
      assert.match(run.definitionId, /^[0-9a-f-]{36}$/i);
      assert.equal((await store.getDefinition(run.definitionId))?.name, 'Runner smoke');
      assert.equal(run.definitionSnapshot?.id, run.definitionId);
    });
  });

  test('enforces llm_judge call budget across the whole run', async () => {
    let judgeCalls = 0;
    const target = new BenchmarkTargetService(undefined as any);
    const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-runner-'));
    const previousDb = process.env.CAST_STATE_DB_PATH;
    process.env.CAST_STATE_DB_PATH = join(projectRoot, 'state.db');
    const db = new StateDbService();
    const store = new BenchmarkStoreService(db);
    const cost = new BenchmarkCostService();
    const runner = new BenchmarkRunnerService(
      store,
      new BenchmarkArtifactService(new StateRedactionService()),
      new BenchmarkGraderService({
        createModel: () => ({
          invoke: async () => {
            judgeCalls += 1;
            return { content: '{"passed":true,"score":1,"reason":"ok"}' };
          },
        }),
      } as any, cost),
      cost,
      target,
    );

    try {
      const run = await runner.runDefinition({
        ...definition(projectRoot),
        graders: [{ id: 'judge', type: 'llm_judge', config: { rubric: 'pass' } }],
        budget: { allowLlmJudge: true, maxLlmJudgeCalls: 1, maxCases: 10 },
      });

      assert.equal(run.status, 'completed');
      assert.equal(judgeCalls, 1);
      assert.equal(run.summary?.passedCases, 1);
      assert.equal(run.summary?.failedCases, 1);

      const results = await store.listResults(run.id);
      assert.equal(results[0].scores[0].metadata?.llmJudgeUsed, true);
      assert.match(results[1].scores[0].reason, /budget/i);
    } finally {
      await db.close();
      if (previousDb === undefined) {
        delete process.env.CAST_STATE_DB_PATH;
      } else {
        process.env.CAST_STATE_DB_PATH = previousDb;
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
