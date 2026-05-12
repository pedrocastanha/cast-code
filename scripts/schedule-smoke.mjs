import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { BenchmarkStoreService } = require('../dist/modules/benchmark/services/benchmark-store.service.js');
const { ScheduleCommandsService } = require('../dist/modules/scheduler/commands/schedule-commands.service.js');
const { ScheduleStoreService } = require('../dist/modules/scheduler/services/schedule-store.service.js');

const root = await mkdtemp(join(tmpdir(), 'cast-schedule-smoke-'));
const previousCwd = process.cwd();
const previousDbPath = process.env.CAST_STATE_DB_PATH;
const previousSnapshotDir = process.env.CAST_SNAPSHOTS_DIR;
process.env.CAST_STATE_DB_PATH = join(root, 'state.db');
process.env.CAST_SNAPSHOTS_DIR = join(root, '.cast', 'snapshots-test');
process.chdir(root);

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

try {
  const benchmarkStore = app.get(BenchmarkStoreService);
  const scheduleCommands = app.get(ScheduleCommandsService);
  const scheduleStore = app.get(ScheduleStoreService);
  const now = new Date().toISOString();

  await benchmarkStore.saveDefinition({
    id: 'bench-smoke',
    projectRoot: root,
    name: 'Schedule smoke benchmark',
    target: { type: 'model_prompt', config: { staticOutput: 'expected-quality from scheduler' } },
    cases: [{ id: 'case-1', input: 'hello', expected: 'expected-quality' }],
    graders: [{ id: 'expected', type: 'string_check', config: { value: 'expected-quality' } }],
    budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000, allowLlmJudge: false },
    createdAt: now,
    updatedAt: now,
  });

  await scheduleCommands.cmdSchedule([
    'create',
    'benchmark',
    'bench-smoke',
    '--cron',
    '*/5 * * * *',
    '--name',
    'Schedule smoke',
  ]);

  const schedules = await scheduleStore.list(root);
  if (schedules.length !== 1) {
    throw new Error(`Expected one schedule, found ${schedules.length}`);
  }

  await scheduleCommands.cmdSchedule(['run', schedules[0].id]);
  const runs = await scheduleStore.listRuns(schedules[0].id);
  if (runs[0]?.status !== 'completed') {
    throw new Error(`Expected completed schedule run, found ${runs[0]?.status ?? 'none'}`);
  }

  await scheduleCommands.cmdSchedule(['pause', schedules[0].id]);
  const paused = await scheduleStore.get(schedules[0].id);
  if (paused?.status !== 'paused') {
    throw new Error(`Expected paused schedule, found ${paused?.status ?? 'none'}`);
  }

  console.log('SCHEDULE_SMOKE_OK', JSON.stringify({
    scheduleId: schedules[0].id,
    runId: runs[0].id,
    benchmarkRunId: runs[0].benchmarkRunId,
  }));
} finally {
  await app.close();
  process.chdir(previousCwd);
  if (previousDbPath === undefined) {
    delete process.env.CAST_STATE_DB_PATH;
  } else {
    process.env.CAST_STATE_DB_PATH = previousDbPath;
  }
  if (previousSnapshotDir === undefined) {
    delete process.env.CAST_SNAPSHOTS_DIR;
  } else {
    process.env.CAST_SNAPSHOTS_DIR = previousSnapshotDir;
  }
  await rm(root, { recursive: true, force: true });
}
