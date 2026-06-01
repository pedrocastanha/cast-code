import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { StateDbService } from '../../state/services/state-db.service';
import type { BenchmarkDefinition, BenchmarkRun } from '../../benchmark/types';
import { ScheduleCronService } from './schedule-cron.service';
import { SchedulePolicyService } from './schedule-policy.service';
import { ScheduleRunnerService } from './schedule-runner.service';
import { ScheduleStoreService } from './schedule-store.service';

const fixtureDefinition = (projectRoot: string): BenchmarkDefinition => ({
  id: 'bench-1',
  projectRoot,
  name: 'Static benchmark',
  target: { type: 'model_prompt', config: { staticOutput: 'expected-quality' } },
  cases: [{ id: 'case-1', input: 'hello', expected: 'expected-quality' }],
  graders: [{ id: 'expected', type: 'string_check', config: { value: 'expected-quality' } }],
  budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000 },
  createdAt: '2026-05-11T00:00:00.000Z',
  updatedAt: '2026-05-11T00:00:00.000Z',
});

const withRunner = async (run: (context: {
  store: ScheduleStoreService;
  runner: ScheduleRunnerService;
  root: string;
  benchmarkDefinitionsRun: BenchmarkDefinition[];
  sandboxCalls: any[];
}) => Promise<void>) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cast-schedule-runner-'));
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(tempDir, 'state.db');
  const db = new StateDbService();
  const store = new ScheduleStoreService(db, new ScheduleCronService());
  const benchmark = fixtureDefinition(tempDir);
  const benchmarkStore = {
    getDefinition: async (id: string) => id === benchmark.id ? benchmark : null,
  };
  const benchmarkDefinitions = {
    validateDefinition: (definition: BenchmarkDefinition) => definition,
  };
  const benchmarkDefinitionsRun: BenchmarkDefinition[] = [];
  const benchmarkRunner = {
    runDefinition: async (definition: BenchmarkDefinition): Promise<BenchmarkRun> => {
      benchmarkDefinitionsRun.push(definition);
      return {
        id: 'run-1',
        definitionId: definition.id,
        projectRoot: definition.projectRoot,
        status: 'completed',
        startedAt: '2026-05-11T00:00:00.000Z',
        completedAt: '2026-05-11T00:00:01.000Z',
        summary: {
          totalCases: 1,
          passedCases: 1,
          failedCases: 0,
          passRate: 1,
          score: 1,
          totalCost: 0,
          totalTokens: 4,
          latencyP50Ms: 1,
          latencyP95Ms: 1,
        },
      };
    },
  };
  const sandboxCalls: any[] = [];
  const sandbox = {
    run: async (options: any, operation: () => Promise<any>) => {
      sandboxCalls.push(options);
      const value = await operation();
      return {
        value,
        context: {
          mode: options.config?.mode ?? 'snapshot',
          requestedMode: options.config?.mode ?? 'snapshot',
          runId: options.runId,
          projectRoot: options.projectRoot,
          root: options.projectRoot,
          artifactDir: options.artifactDir,
          commandLog: [],
        },
        artifacts: [],
      };
    },
  };
  const scheduler = new ScheduleRunnerService(
    store,
    new SchedulePolicyService(),
    benchmarkStore as any,
    benchmarkDefinitions as any,
    benchmarkRunner as any,
    undefined,
    sandbox as any,
  );

  try {
    await run({ store, runner: scheduler, root: tempDir, benchmarkDefinitionsRun, sandboxCalls });
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

describe('ScheduleRunnerService', () => {
  test('runs a benchmark schedule manually and records a schedule run', async () => {
    await withRunner(async ({ store, runner, root }) => {
      const schedule = await store.save({
        id: 'schedule-1',
        projectRoot: root,
        name: 'Benchmark schedule',
        cronExpression: '0 * * * *',
        target: { type: 'benchmark', ref: 'bench-1', config: { definitionId: 'bench-1' } },
        approvalPolicy: 'dry-run-only',
        budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000 },
        maxRuntimeMs: 60_000,
      });

      const result = await runner.runSchedule(schedule.id, { manual: true });

      assert.equal(result.run.status, 'completed');
      assert.equal(result.run.benchmarkRunId, 'run-1');
      assert.equal(result.benchmarkRun?.status, 'completed');
      assert.equal((await store.listRuns(schedule.id)).length, 1);
    });
  });

  test('uses the benchmark definition budget when the schedule has none', async () => {
    await withRunner(async ({ store, runner, root }) => {
      const schedule = await store.save({
        id: 'schedule-2',
        projectRoot: root,
        name: 'Unsafe benchmark schedule',
        cronExpression: '0 * * * *',
        target: { type: 'benchmark', ref: 'bench-1', config: { definitionId: 'bench-1' } },
        approvalPolicy: 'dry-run-only',
        maxRuntimeMs: 60_000,
      });

      const result = await runner.runSchedule(schedule.id, { manual: true });

      assert.equal(result.run.status, 'completed');
      assert.equal(result.run.benchmarkRunId, 'run-1');
    });
  });

  test('wraps scheduled benchmark execution in one schedule sandbox and disables nested benchmark sandboxing', async () => {
    await withRunner(async ({ store, runner, root, benchmarkDefinitionsRun, sandboxCalls }) => {
      const schedule = await store.save({
        id: 'schedule-3',
        projectRoot: root,
        name: 'Sandboxed benchmark schedule',
        cronExpression: '0 * * * *',
        target: { type: 'benchmark', ref: 'bench-1', config: { definitionId: 'bench-1' } },
        approvalPolicy: 'dry-run-only',
        sandbox: { mode: 'snapshot', rollbackOnFailure: true },
        maxRuntimeMs: 60_000,
      });

      const result = await runner.runSchedule(schedule.id, { manual: true });

      assert.equal(result.run.status, 'completed');
      assert.equal(benchmarkDefinitionsRun[0].sandbox?.mode, 'none');
      assert.equal(sandboxCalls[0].runId, result.run.id);
      assert.equal(sandboxCalls[0].config.mode, 'snapshot');
      assert.equal(sandboxCalls[0].config.rollbackOnFailure, true);
      assert.match(sandboxCalls[0].artifactDir, /\.cast\/schedules\/.+/);
    });
  });

  test('falls back host-scoped agent schedules to snapshot sandbox', async () => {
    await withRunner(async ({ store, runner, root, sandboxCalls }) => {
      const schedule = await store.save({
        id: 'schedule-agent',
        projectRoot: root,
        name: 'Agent schedule',
        cronExpression: '0 * * * *',
        target: { type: 'agent_prompt', ref: 'summarize', config: { prompt: 'summarize', expected: 'ok' } },
        approvalPolicy: 'dry-run-only',
        budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000 },
        sandbox: { mode: 'git-worktree', rollbackOnFailure: true },
        maxRuntimeMs: 60_000,
      });

      const result = await runner.runSchedule(schedule.id, { manual: true });

      assert.equal(result.run.status, 'completed');
      assert.equal(sandboxCalls[0].config.mode, 'snapshot');
      assert.equal(sandboxCalls[0].requestedMode, 'git-worktree');
      assert.match(sandboxCalls[0].fallbackReason, /host-scoped agent schedules/);
    });
  });

  test('returns timeout without waiting for a hung operation to finish', async () => {
    await withRunner(async ({ runner }) => {
      let finished = false;
      const startedAt = Date.now();
      await assert.rejects(
        () => (runner as any).withTimeout(async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          finished = true;
          return 'late';
        }, 1),
        /exceeded max runtime/i,
      );
      assert(Date.now() - startedAt < 35);
      assert.equal(finished, false);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(finished, true);
    });
  });
});
