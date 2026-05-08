import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  BenchmarkDefinition,
  BenchmarkHarnessPlan,
  BenchmarkSummary,
  BenchmarkTargetCandidate,
  BenchmarkTargetType,
} from './benchmark.types';

test('benchmark target types cover every planned adapter', () => {
  const targetTypes: BenchmarkTargetType[] = [
    'model_prompt',
    'agent_workflow',
    'api_endpoint',
    'rag_answer',
    'mcp_tool',
    'environment_task',
    'scheduler_job',
  ];

  assert.deepEqual(targetTypes, [
    'model_prompt',
    'agent_workflow',
    'api_endpoint',
    'rag_answer',
    'mcp_tool',
    'environment_task',
    'scheduler_job',
  ]);
});

test('benchmark fixtures compile with summary contract', () => {
  const definition: BenchmarkDefinition = {
    id: 'bench-1',
    projectRoot: '/repo',
    name: 'Smoke benchmark',
    target: { type: 'model_prompt', config: { prompt: '{{input}}' } },
    cases: [
      { id: 'case-1', input: 'Say hello', expected: 'hello' },
    ],
    graders: [
      { id: 'contains-hello', type: 'string_check', config: { mode: 'contains', value: 'hello' } },
    ],
    budget: { maxCostUsd: 1, maxTokens: 1000, maxCases: 3 },
    models: [{ provider: 'openai', model: 'gpt-4.1-mini' }],
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
  };

  const summary: BenchmarkSummary = {
    totalCases: 1,
    passedCases: 1,
    failedCases: 0,
    passRate: 1,
    score: 1,
    totalCost: 0,
    totalTokens: 12,
    latencyP50Ms: 10,
    latencyP95Ms: 10,
  };

  assert.equal(definition.target.type, 'model_prompt');
  assert.equal(summary.passRate, 1);
});

test('benchmark discovery types describe candidates and harness plans', () => {
  const candidate: BenchmarkTargetCandidate = {
    id: 'api:post:/chat',
    type: 'api_endpoint',
    label: 'POST /chat',
    confidence: 0.94,
    filePath: '/tmp/project/src/routes/chat.ts',
    method: 'POST',
    routePath: '/chat',
    handlerName: 'chat',
    source: 'explicit',
    target: {
      type: 'api_endpoint',
      config: {
        method: 'POST',
        url: 'http://localhost:3000/chat',
        body: { message: '{{input}}' },
      },
    },
    requiresServer: true,
    requiresWrite: false,
    risk: 'low',
    evidence: ['router.post("/chat")'],
  };

  const plan: BenchmarkHarnessPlan = {
    candidateId: candidate.id,
    mode: 'direct_http',
    targetType: 'api_endpoint',
    target: candidate.target,
    requiresWrite: false,
    confirmationRequired: false,
    controlledEnvironmentRecommended: false,
    reason: 'Endpoint can be called over HTTP.',
    modelOverridePoints: [{
      id: 'body:model',
      kind: 'request_body',
      label: 'Request body field model',
      key: 'model',
      confidence: 0.75,
      requiresWrite: false,
      instructions: 'Pass a model value in the benchmark request body.',
    }],
    risk: 'low',
    evidence: candidate.evidence,
  };

  assert.equal(plan.mode, 'direct_http');
  assert.equal(plan.targetType, 'api_endpoint');
});
