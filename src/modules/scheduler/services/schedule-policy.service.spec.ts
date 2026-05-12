import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { BenchmarkDefinition } from '../../benchmark/types';
import type { ScheduleDefinition } from '../types';
import { SchedulePolicyService } from './schedule-policy.service';

const fixtureSchedule = (patch: Partial<ScheduleDefinition> = {}): ScheduleDefinition => ({
  id: 'schedule-1',
  projectRoot: '/tmp/project',
  name: 'Hourly benchmark',
  cronExpression: '0 * * * *',
  status: 'active',
  target: { type: 'benchmark', ref: 'bench-1', config: { definitionId: 'bench-1' } },
  approvalPolicy: 'dry-run-only',
  budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000 },
  maxRuntimeMs: 60_000,
  createdAt: '2026-05-11T00:00:00.000Z',
  updatedAt: '2026-05-11T00:00:00.000Z',
  ...patch,
});

describe('SchedulePolicyService', () => {
  test('requires budgets for scheduled benchmarks', () => {
    const policy = new SchedulePolicyService();
    const decision = policy.assess(fixtureSchedule({ budget: undefined }), { benchmark: null });

    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? '', /budget/);
  });

  test('blocks mutation-capable schedules without pre-approval', () => {
    const policy = new SchedulePolicyService();
    const decision = policy.assess(fixtureSchedule({
      target: { type: 'environment_task', ref: 'publish', config: { task: 'campaign_publish to external_post' } },
      budget: undefined,
    }));

    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? '', /pre-approved/);
  });

  test('allows pre-approved mutation-capable schedules with warning', () => {
    const policy = new SchedulePolicyService();
    const decision = policy.assess(fixtureSchedule({
      target: { type: 'environment_task', ref: 'publish', config: { task: 'campaign_publish to external_post' } },
      approvalPolicy: 'pre-approved',
      budget: undefined,
    }));

    assert.equal(decision.allowed, true);
    assert.equal(decision.severity, 'warning');
  });

  test('blocks dry-run benchmark schedules when the referenced benchmark enables writes', () => {
    const policy = new SchedulePolicyService();
    const benchmark: BenchmarkDefinition = {
      id: 'bench-1',
      projectRoot: '/tmp/project',
      name: 'Mutation benchmark',
      target: { type: 'api_endpoint', config: { url: 'https://api.example.test/campaigns', write: true, dryRun: false } },
      cases: [{ id: 'case-1', input: 'publish campaign' }],
      graders: [],
      budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000 },
      createdAt: '2026-05-11T00:00:00.000Z',
      updatedAt: '2026-05-11T00:00:00.000Z',
    };

    const decision = policy.assess(fixtureSchedule(), { benchmark });

    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? '', /benchmark/i);
    assert.match(decision.reason ?? '', /writes/i);
  });

  test('scans mutation risk in referenced benchmark definitions', () => {
    const policy = new SchedulePolicyService();
    const benchmark: BenchmarkDefinition = {
      id: 'bench-1',
      projectRoot: '/tmp/project',
      name: 'Publish benchmark',
      target: { type: 'agent_workflow', config: { prompt: 'campaign_publish to external_post' } },
      cases: [{ id: 'case-1', input: 'go' }],
      graders: [],
      budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000 },
      createdAt: '2026-05-11T00:00:00.000Z',
      updatedAt: '2026-05-11T00:00:00.000Z',
    };

    const decision = policy.assess(fixtureSchedule(), { benchmark });

    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? '', /pre-approved/);
  });
});
