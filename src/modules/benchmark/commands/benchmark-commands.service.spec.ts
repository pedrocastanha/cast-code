import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { StateDbService } from '../../state/services/state-db.service';
import { StateRedactionService } from '../../state/services/state-redaction.service';
import { BenchmarkCommandsService } from './benchmark-commands.service';
import { BenchmarkArtifactService } from '../services/benchmark-artifact.service';
import { BenchmarkCostService } from '../services/benchmark-cost.service';
import { BenchmarkDefinitionService } from '../services/benchmark-definition.service';
import { BenchmarkExplicitTargetService } from '../services/benchmark-explicit-target.service';
import { BenchmarkGraderService } from '../services/benchmark-grader.service';
import { BenchmarkHarnessPlannerService } from '../services/benchmark-harness-planner.service';
import { BenchmarkModelLocatorService } from '../services/benchmark-model-locator.service';
import { BenchmarkRouteDiscoveryService } from '../services/benchmark-route-discovery.service';
import { BenchmarkRunnerService } from '../services/benchmark-runner.service';
import { BenchmarkSandboxDecisionService } from '../services/benchmark-sandbox-decision.service';
import { BenchmarkStoreService } from '../services/benchmark-store.service';
import { BenchmarkTargetService } from '../services/benchmark-target.service';

const captureStdout = async (run: () => Promise<void>): Promise<string> => {
  const previousWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
    return output;
  } finally {
    process.stdout.write = previousWrite;
  }
};

const buildCommandHarness = (db: StateDbService, platformSync?: any) => {
  const store = new BenchmarkStoreService(db);
  const target = new BenchmarkTargetService(undefined as any);
  target.setAgentExecutor({
    runBenchmarkPrompt: async (prompt: string) => ({
      output: `${prompt} expected-quality`,
      tokens: 8,
      cost: 0,
    }),
  });
  const cost = new BenchmarkCostService();
  const definitions = new BenchmarkDefinitionService();
  const runner = new BenchmarkRunnerService(
    store,
    new BenchmarkArtifactService(new StateRedactionService()),
    new BenchmarkGraderService(undefined as any, cost),
    cost,
    target,
  );
  const routeDiscovery = new BenchmarkRouteDiscoveryService();
  const commands = new BenchmarkCommandsService(
    store,
    definitions,
    runner,
    target,
    new BenchmarkExplicitTargetService(routeDiscovery),
    routeDiscovery,
    new BenchmarkHarnessPlannerService(),
    new BenchmarkModelLocatorService(),
    new BenchmarkSandboxDecisionService(),
    platformSync,
  );

  return { commands, store };
};

test('BenchmarkCommandsService quick creates a definition, runs it, lists it, and opens report path', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-command-'));
  const previousCwd = process.cwd();
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(projectRoot, 'state.db');
  process.chdir(projectRoot);

  const db = new StateDbService();
  const { commands, store } = buildCommandHarness(db);

  try {
    const smartInput = {
      question: async (message: string) => message.includes('Expected') ? 'expected-quality' : 'Write a campaign brief',
      askChoice: async () => 'y',
    };

    const quickOutput = await captureStdout(() => commands.cmdBenchmark(['quick'], smartInput as any));
    assert.match(quickOutput, /Benchmark completed/i);

    const definitions = await store.listDefinitions(projectRoot);
    assert.equal(definitions.length, 1);
    assert.match(definitions[0].name, /^quick-/);

    const listOutput = await captureStdout(() => commands.cmdBenchmark(['list'], smartInput as any));
    assert.match(listOutput, /quick-/);

    const runs = await store.listRuns(projectRoot);
    const openOutput = await captureStdout(() => commands.cmdBenchmark(['open', runs[0].id], smartInput as any));
    assert.match(openOutput, /Benchmark report:/);
    assert.match(openOutput, /Platform view unavailable/);

    const exportOutput = await captureStdout(() => commands.cmdBenchmark(['export', runs[0].id, '--format', 'markdown'], smartInput as any));
    assert.match(exportOutput, /# Benchmark Report/);
  } finally {
    await db.close();
    process.chdir(previousCwd);
    if (previousDb === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousDb;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('BenchmarkCommandsService open prints platform link when the run has synced remotely', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-command-platform-open-'));
  const previousCwd = process.cwd();
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(projectRoot, 'state.db');
  process.chdir(projectRoot);

  const db = new StateDbService();
  const platformUrl = 'http://localhost:3003/projects/project-1/benchmarks/remote-run-1';
  const platformSync = {
    syncDefinition: async () => ({ status: 'synced' }),
    syncCompletedRun: async () => ({ status: 'synced', webUrl: platformUrl }),
    getWebRunUrl: async () => platformUrl,
  };
  const { commands, store } = buildCommandHarness(db, platformSync);

  try {
    const smartInput = {
      question: async (message: string) => message.includes('Expected') ? 'expected-quality' : 'Write a campaign brief',
      askChoice: async () => 'y',
    };

    await captureStdout(() => commands.cmdBenchmark(['quick'], smartInput as any));
    const runs = await store.listRuns(projectRoot);
    const openOutput = await captureStdout(() => commands.cmdBenchmark(['open', runs[0].id], smartInput as any));

    assert.match(openOutput, new RegExp(`Benchmark platform: ${platformUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.doesNotMatch(openOutput, /Benchmark report:/);
  } finally {
    await db.close();
    process.chdir(previousCwd);
    if (previousDb === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousDb;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('explicit benchmark target resolves without broad discovery and saves definition', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-explicit-command-'));
  const previousCwd = process.cwd();
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(projectRoot, 'state.db');
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  await writeFile(
    join(projectRoot, 'src/chat.ts'),
    'router.post(\'/chat\', (req, res) => res.json({ answer: req.body.message }))',
  );
  process.chdir(projectRoot);

  const db = new StateDbService();
  const { commands, store } = buildCommandHarness(db);

  try {
    const smartInput = {
      question: async (message: string) => {
        if (message.includes('Example input')) {
          return 'hello benchmark';
        }
        if (message.includes('Expected')) {
          return 'hello';
        }
        return 'http://localhost:3000';
      },
      askChoice: async () => 'n',
    };

    const output = await captureStdout(() => commands.cmdBenchmark(
      ['@src/chat.ts', 'POST', '/chat', '--base-url', 'http://localhost:3000'],
      smartInput as any,
    ));
    const definitions = await store.listDefinitions(projectRoot);

    assert.match(output, /Harness: direct_http/);
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].target.type, 'api_endpoint');
    assert.equal(definitions[0].target.config.url, 'http://localhost:3000/chat');
    const discoveredTarget = definitions[0].cases[0].metadata?.discoveredTarget as { harnessMode?: string } | undefined;
    assert.equal(discoveredTarget?.harnessMode, 'direct_http');
  } finally {
    await db.close();
    process.chdir(previousCwd);
    if (previousDb === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousDb;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('discovery command lists candidates when no interactive input is available', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-discover-command-'));
  const previousCwd = process.cwd();
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(projectRoot, 'state.db');
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  await writeFile(join(projectRoot, 'src/chat.ts'), 'router.post(\'/chat\', handler)');
  process.chdir(projectRoot);

  const db = new StateDbService();
  const { commands } = buildCommandHarness(db);

  try {
    const output = await captureStdout(() => commands.cmdBenchmark(['discover']));

    assert.match(output, /Discovered benchmarkable targets/);
    assert.match(output, /POST \/chat/);
  } finally {
    await db.close();
    process.chdir(previousCwd);
    if (previousDb === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousDb;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
});
