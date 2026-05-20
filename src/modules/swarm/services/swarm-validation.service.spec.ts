import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SwarmValidationService } from './swarm-validation.service';
import type { SwarmPlan, SwarmTaskPlan } from '../types';

const baseWorker = {
  id: 'worker-1',
  kind: 'ephemeral_agent' as const,
  name: 'engineer',
  role: 'Engineer',
  systemPrompt: 'Do the work.',
  handoffFormat: { summaryMaxChars: 500, includeDecisions: true, includeTestsRun: true },
};

const baseTask = (overrides: Partial<SwarmTaskPlan> = {}): SwarmTaskPlan => ({
  id: 'task-1',
  title: 'Task',
  description: 'Do task',
  dependsOn: [],
  worker: baseWorker,
  fileOwnership: [{ glob: 'src/**' }],
  allowedTools: ['read_file'],
  injectedSkills: [],
  discoverableSkills: [],
  acceptanceCriteria: [],
  focusedVerification: [],
  ...overrides,
});

const basePlan = (overrides: Partial<SwarmPlan> = {}): SwarmPlan => ({
  id: 'plan-1',
  projectRoot: '/tmp/project',
  workspaceRoot: '/tmp/project',
  goal: 'Implement feature',
  reasonForSwarm: 'Parallel work',
  status: 'draft',
  integrationMode: 'apply_safe',
  runtimePolicy: { kind: 'default' },
  globalConstraints: { maxWorkers: 2 },
  tasks: [baseTask()],
  finalVerification: [],
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('SwarmValidationService', () => {
  const service = new SwarmValidationService();

  test('accepts a valid plan', () => {
    assert.deepEqual(service.validatePlan(basePlan()), []);
  });

  test('rejects cyclic dependencies', () => {
    const errors = service.validatePlan(basePlan({
      tasks: [
        baseTask({ id: 'a', dependsOn: ['b'] }),
        baseTask({ id: 'b', dependsOn: ['a'] }),
      ],
    }));
    assert.match(errors.join(' '), /cyclic/i);
  });

  test('rejects missing ownership', () => {
    const errors = service.validatePlan(basePlan({
      tasks: [baseTask({ fileOwnership: [] })],
    }));
    assert.match(errors.join(' '), /fileOwnership/i);
  });
});
