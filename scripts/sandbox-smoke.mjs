import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { BenchmarkCommandsService } = require('../dist/modules/benchmark/commands/benchmark-commands.service.js');
const { BenchmarkStoreService } = require('../dist/modules/benchmark/services/benchmark-store.service.js');
const { SandboxCommandsService } = require('../dist/modules/sandbox/commands/sandbox-commands.service.js');

const root = await mkdtemp(join(tmpdir(), 'cast-sandbox-smoke-'));
const previousCwd = process.cwd();
const previousDbPath = process.env.CAST_STATE_DB_PATH;
const previousSnapshotDir = process.env.CAST_SNAPSHOTS_DIR;
process.env.CAST_STATE_DB_PATH = join(root, 'state.db');
process.env.CAST_SNAPSHOTS_DIR = join(root, '.cast', 'snapshots-test');
process.chdir(root);

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

try {
  const benchmarkCommands = app.get(BenchmarkCommandsService);
  const benchmarkStore = app.get(BenchmarkStoreService);
  const sandboxCommands = app.get(SandboxCommandsService);
  const now = new Date().toISOString();

  await writeFile(join(root, 'fixture.txt'), 'original fixture');
  await benchmarkStore.saveDefinition({
    id: 'bench-sandbox-smoke',
    projectRoot: root,
    name: 'Sandbox smoke benchmark',
    target: { type: 'model_prompt', config: { staticOutput: 'expected-quality from sandbox' } },
    cases: [{ id: 'case-1', input: 'hello', expected: 'expected-quality' }],
    graders: [{ id: 'expected', type: 'string_check', config: { value: 'expected-quality' } }],
    budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000, allowLlmJudge: false },
    sandbox: { mode: 'snapshot', rollbackOnFailure: true },
    createdAt: now,
    updatedAt: now,
  });

  await benchmarkCommands.cmdBenchmark(['run', 'bench-sandbox-smoke', '--sandbox', 'snapshot']);
  const runs = await benchmarkStore.listRuns(root);
  const run = runs[0];
  if (!run || run.status !== 'completed') {
    throw new Error(`Expected completed benchmark run, found ${run?.status ?? 'none'}`);
  }
  if (!run.artifactDir || !existsSync(join(run.artifactDir, 'sandbox-summary.json'))) {
    throw new Error('Expected sandbox-summary.json artifact.');
  }
  if (!existsSync(join(run.artifactDir, 'sandbox-command.log'))) {
    throw new Error('Expected sandbox-command.log artifact.');
  }

  await writeFile(join(root, 'fixture.txt'), 'mutated fixture');
  await sandboxCommands.cmdSandbox(['rollback', run.id]);
  const restored = await readFile(join(root, 'fixture.txt'), 'utf-8');
  if (restored !== 'original fixture') {
    throw new Error(`Expected rollback to restore fixture, found: ${restored}`);
  }

  console.log('SANDBOX_SMOKE_OK', JSON.stringify({
    runId: run.id,
    artifactDir: run.artifactDir,
    restored,
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
