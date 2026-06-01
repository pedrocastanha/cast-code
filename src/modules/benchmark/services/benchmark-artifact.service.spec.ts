import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { StateRedactionService } from '../../state/services/state-redaction.service';
import { BenchmarkArtifactService } from './benchmark-artifact.service';
import type { BenchmarkDefinition, BenchmarkResult, BenchmarkRun } from '../types/benchmark.types';

test('BenchmarkArtifactService writes redacted config, jsonl results, and markdown report', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-benchmark-artifacts-'));
  const service = new BenchmarkArtifactService(new StateRedactionService());

  const definition: BenchmarkDefinition = {
    id: 'bench-1',
    projectRoot,
    name: 'Secret smoke',
    target: { type: 'model_prompt', config: { Authorization: 'Bearer sk-secret123456' } },
    cases: [{
      id: 'case-1',
      input: 'hello',
      expected: 'world',
      metadata: {
        discoveredTarget: {
          candidateId: 'api:post:/chat',
          source: 'explicit',
          method: 'POST',
          routePath: '/chat',
          harnessMode: 'direct_http',
        },
      },
    }],
    graders: [{ id: 'contains-world', type: 'string_check', config: { mode: 'contains', value: 'world' } }],
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
  };
  const run: BenchmarkRun = {
    id: 'run-1',
    definitionId: 'bench-1',
    projectRoot,
    status: 'running',
    startedAt: '2026-05-08T00:00:00.000Z',
    definitionSnapshot: definition,
  };
  const result: BenchmarkResult = {
    id: 'result-1',
    runId: 'run-1',
    caseId: 'case-1',
    status: 'failed',
    input: 'hello',
    output: 'nope sk-verysecret123456',
    expected: 'world',
    scores: [{ graderId: 'contains-world', type: 'string_check', passed: false, score: 0, reason: 'missing' }],
    score: 0,
    cost: 0,
    tokens: 4,
    latencyMs: 12,
    startedAt: '2026-05-08T00:00:00.000Z',
    completedAt: '2026-05-08T00:00:01.000Z',
  };

  try {
    const prepared = await service.prepareRun(run, definition);
    await service.appendResult(projectRoot, run.id, result);
    const reportPath = await service.writeReport(projectRoot, { ...run, summary: {
      totalCases: 1,
      passedCases: 0,
      failedCases: 1,
      passRate: 0,
      score: 0,
      totalCost: 0,
      totalTokens: 4,
      latencyP50Ms: 12,
      latencyP95Ms: 12,
    } }, definition, [result]);

    assert.equal(prepared.artifactDir, join(projectRoot, '.cast', 'benchmarks', 'run-1'));
    const config = JSON.parse(await readFile(join(prepared.artifactDir, 'config.json'), 'utf-8'));
    assert.match(JSON.stringify(config), /\[REDACTED_/);
    assert.equal(config.benchmark.cases[0].metadata.discoveredTarget.harnessMode, 'direct_http');
    assert.match(await readFile(join(prepared.artifactDir, 'cases.jsonl'), 'utf-8'), /case-1/);
    assert.doesNotMatch(await readFile(join(prepared.artifactDir, 'results.jsonl'), 'utf-8'), /sk-verysecret/);
    assert.match(await readFile(reportPath, 'utf-8'), /Secret smoke/);
    assert.match(await readFile(reportPath, 'utf-8'), /Pass rate: 0\.0%/);
    assert.match(await readFile(reportPath, 'utf-8'), /Cost: \$0/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
