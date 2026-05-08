import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { BenchmarkTargetCandidate } from '../types';
import { BenchmarkHarnessPlannerService } from './benchmark-harness-planner.service';

function candidate(overrides: Partial<BenchmarkTargetCandidate> = {}): BenchmarkTargetCandidate {
  return {
    id: 'api:post:/chat',
    type: 'api_endpoint',
    label: 'POST /chat',
    confidence: 0.9,
    method: 'POST',
    routePath: '/chat',
    source: 'explicit',
    target: { type: 'api_endpoint', config: { method: 'POST', url: 'http://localhost:3000/chat' } },
    requiresServer: true,
    requiresWrite: false,
    risk: 'low',
    evidence: ['router.post("/chat")'],
    ...overrides,
  };
}

test('plans direct HTTP when URL exists and no write is required', () => {
  const planner = new BenchmarkHarnessPlannerService();
  const plan = planner.plan(candidate(), []);
  assert.equal(plan.mode, 'direct_http');
  assert.equal(plan.confirmationRequired, false);
});

test('plans wrapper-required with controlled environment recommendation', () => {
  const planner = new BenchmarkHarnessPlannerService();
  const plan = planner.plan(candidate({
    requiresWrite: true,
    target: { type: 'api_endpoint', config: { method: 'POST' } },
  }), []);

  assert.equal(plan.mode, 'wrapper_required');
  assert.equal(plan.confirmationRequired, true);
  assert.equal(plan.controlledEnvironmentRecommended, true);
});
