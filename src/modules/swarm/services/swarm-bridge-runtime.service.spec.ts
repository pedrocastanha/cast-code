import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { BridgeProviderId } from '../../bridge/types/bridge.types';
import { SwarmBridgeRuntimeService } from './swarm-bridge-runtime.service';
import type { SwarmPlan, SwarmTaskPlan, SwarmWorkerRunInput } from '../types';

const baseWorker = {
  id: 'worker-1',
  kind: 'ephemeral_agent' as const,
  name: 'engineer',
  role: 'Engineer',
  systemPrompt: 'Do the work.',
  handoffFormat: { summaryMaxChars: 500, includeDecisions: true, includeTestsRun: true },
};

const baseTask = (): SwarmTaskPlan => ({
  id: 'task-1',
  title: 'Task',
  description: 'Do work',
  dependsOn: [],
  worker: baseWorker,
  fileOwnership: [{ glob: '**/*' }],
  allowedTools: ['read_file'],
  injectedSkills: [],
  discoverableSkills: [],
  acceptanceCriteria: [],
  focusedVerification: [],
});

const basePlan = (runtimePolicy: SwarmPlan['runtimePolicy']): SwarmPlan => ({
  id: 'plan-1',
  projectRoot: '/tmp/project',
  workspaceRoot: '/tmp/project',
  goal: 'Implement feature',
  reasonForSwarm: 'Parallel work',
  status: 'approved',
  integrationMode: 'manual',
  runtimePolicy,
  globalConstraints: { maxWorkers: 4 },
  tasks: [baseTask()],
  finalVerification: [],
  createdAt: new Date().toISOString(),
});

const baseWorkerInput = (runtimePolicy: SwarmPlan['runtimePolicy']): SwarmWorkerRunInput => ({
  plan: basePlan(runtimePolicy),
  planTask: baseTask(),
  taskRun: {
    id: 'task-run-1',
    planTaskId: 'task-1',
    workerId: 'worker-1',
    worktreePath: '/tmp/project/.cast/worktrees/run-1/task-1',
    branchName: 'cast/swarm/run-1/task-1',
    status: 'queued',
  },
  worktree: {
    runId: 'run-1',
    taskId: 'task-1',
    branchName: 'cast/swarm/run-1/task-1',
    worktreePath: '/tmp/project/.cast/worktrees/run-1/task-1',
    projectRoot: '/tmp/project',
    workspaceRoot: '/tmp/project',
  },
  permission: {
    runId: 'run-1',
    taskRunId: 'task-run-1',
    workerId: 'worker-1',
    mode: 'headless',
    allowedCommandRules: [],
    allowedWriteGlobs: ['**/*'],
    deniedWriteGlobs: [],
  },
});

describe('SwarmBridgeRuntimeService', () => {
  test('resolveDefaultPolicy returns default when bridge is inactive', () => {
    const service = new SwarmBridgeRuntimeService();
    assert.deepEqual(service.resolveDefaultPolicy(), { kind: 'default' });
  });

  test('resolveDefaultPolicy inherits active bridge provider', () => {
    const bridgeSession = {
      getProviderId: () => 'codex' as BridgeProviderId,
    };
    const bridgeCommands = { isConnected: () => true };
    const service = new SwarmBridgeRuntimeService(
      bridgeCommands as any,
      bridgeSession as any,
    );

    assert.deepEqual(service.resolveDefaultPolicy(), {
      kind: 'bridge',
      provider: 'codex',
      maxConcurrentSessions: 2,
    });
  });

  test('applyPolicyToConstraints caps maxWorkers for bridge policy', () => {
    const service = new SwarmBridgeRuntimeService();
    const capped = service.applyPolicyToConstraints(
      { kind: 'bridge', provider: 'claude', maxConcurrentSessions: 1 },
      { maxWorkers: 8 },
    );
    assert.equal(capped.maxWorkers, 1);
  });

  test('formatPolicyLabel describes serialized bridge mode', () => {
    const service = new SwarmBridgeRuntimeService();
    const label = service.formatPolicyLabel({
      kind: 'bridge',
      provider: 'claude',
      maxConcurrentSessions: 1,
    });
    assert.match(label, /serialized on active \/bridge session/);
  });

  test('runWorker rejects when bridge is not connected', async () => {
    const service = new SwarmBridgeRuntimeService();
    await assert.rejects(
      () => service.runWorker(baseWorkerInput({
        kind: 'bridge',
        provider: 'codex',
        maxConcurrentSessions: 2,
      })),
      /Bridge is not connected/,
    );
  });
});
