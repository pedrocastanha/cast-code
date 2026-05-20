import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, test } from 'node:test';
import { StateDbService } from '../../state/services/state-db.service';
import { SandboxCommandRunnerService } from '../../sandbox/services/sandbox-command-runner.service';
import { SwarmDispatcherService } from './swarm-dispatcher.service';
import { SwarmRunStoreService } from './swarm-run-store.service';
import { SwarmWorkerRuntimeService } from './swarm-worker-runtime.service';
import { SwarmWorktreeService } from './swarm-worktree.service';
import { SwarmOwnershipService } from './swarm-ownership.service';
import type { SwarmPlan, SwarmRun } from '../types';

const exec = promisify(execFile);

const initGitRepo = async (root: string) => {
  await exec('git', ['init'], { cwd: root });
  await exec('git', ['config', 'user.email', 'swarm@test.local'], { cwd: root });
  await exec('git', ['config', 'user.name', 'Swarm Test'], { cwd: root });
  await writeFile(join(root, 'README.md'), '# swarm test\n', 'utf-8');
  await exec('git', ['add', '.'], { cwd: root });
  await exec('git', ['commit', '-m', 'init'], { cwd: root });
};

describe('SwarmDispatcherService', () => {
  test('executes an approved run in dry-run mode with worktrees', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cast-swarm-dispatch-'));
    const previousDb = process.env.CAST_STATE_DB_PATH;
    process.env.CAST_STATE_DB_PATH = join(tempDir, 'state.db');

    try {
      await initGitRepo(tempDir);
      const db = new StateDbService();
      const store = new SwarmRunStoreService(db);
      const commands = new SandboxCommandRunnerService();
      const worktree = new SwarmWorktreeService(commands);
      const workerRuntime = new SwarmWorkerRuntimeService(
        worktree,
        new SwarmOwnershipService(),
        commands,
      );
      const dispatcher = new SwarmDispatcherService(store, worktree, workerRuntime);

      const plan: SwarmPlan = {
        id: 'plan-1',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
        goal: 'Test swarm',
        reasonForSwarm: 'test',
        status: 'approved',
        integrationMode: 'apply_safe',
        runtimePolicy: { kind: 'default' },
        globalConstraints: { maxWorkers: 2 },
        tasks: [{
          id: 'cli',
          title: 'CLI task',
          description: 'dry run task',
          dependsOn: [],
          worker: {
            id: 'cli-worker',
            kind: 'ephemeral_agent',
            name: 'cli-engineer',
            role: 'CLI engineer',
            systemPrompt: 'Execute task.',
            handoffFormat: { summaryMaxChars: 500, includeDecisions: true, includeTestsRun: true },
          },
          fileOwnership: [{ glob: '.cast/**' }, { glob: 'README.md' }],
          allowedTools: ['read_file'],
          injectedSkills: [],
          discoverableSkills: [],
          acceptanceCriteria: [],
          focusedVerification: [],
        }],
        finalVerification: [],
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
      };
      await store.savePlan(plan);

      const run: SwarmRun = {
        id: 'run-1',
        planId: plan.id,
        status: 'approved',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
        integrationMode: 'apply_safe',
        runtimePolicy: { kind: 'default' },
        tasks: [{
          id: 'task-run-1',
          planTaskId: 'cli',
          status: 'queued',
          workerId: 'cli-worker',
          worktreePath: '',
          branchName: 'cast/swarm/run-1/cli',
        }],
        createdAt: new Date().toISOString(),
      };
      await store.saveRun(run);

      const completed = await dispatcher.dispatch({ runId: run.id, dryRun: true });
      assert.equal(completed.status, 'completed');
      assert.equal(completed.tasks[0].status, 'completed');
      assert.ok(completed.tasks[0].worktreePath.includes('.cast/worktrees'));
      assert.ok(completed.tasks[0].handoff?.changedFiles.length);
      await db.close();
    } finally {
      if (previousDb === undefined) {
        delete process.env.CAST_STATE_DB_PATH;
      } else {
        process.env.CAST_STATE_DB_PATH = previousDb;
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
