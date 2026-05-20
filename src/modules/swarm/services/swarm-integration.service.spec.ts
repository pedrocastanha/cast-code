import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, test } from 'node:test';
import { StateDbService } from '../../state/services/state-db.service';
import { SandboxCommandRunnerService } from '../../sandbox/services/sandbox-command-runner.service';
import { SwarmIntegrationService } from './swarm-integration.service';
import { SwarmRunStoreService } from './swarm-run-store.service';
import { SwarmWorktreeService } from './swarm-worktree.service';
import { SwarmOwnershipService } from './swarm-ownership.service';
import type { SwarmPlan, SwarmRun } from '../types';

const exec = promisify(execFile);

const initGitRepo = async (root: string) => {
  await exec('git', ['init'], { cwd: root });
  await exec('git', ['config', 'user.email', 'swarm@test.local'], { cwd: root });
  await exec('git', ['config', 'user.name', 'Swarm Test'], { cwd: root });
  await writeFile(join(root, 'README.md'), '# swarm integration\n', 'utf-8');
  await exec('git', ['add', '.'], { cwd: root });
  await exec('git', ['commit', '-m', 'init'], { cwd: root });
};

describe('SwarmIntegrationService', () => {
  test('apply_safe copies an owned worktree file into the main workspace', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cast-swarm-integration-'));
    const previousDb = process.env.CAST_STATE_DB_PATH;
    process.env.CAST_STATE_DB_PATH = join(tempDir, 'state.db');

    try {
      await initGitRepo(tempDir);
      const db = new StateDbService();
      const store = new SwarmRunStoreService(db);
      const commands = new SandboxCommandRunnerService();
      const worktree = new SwarmWorktreeService(commands);
      const integration = new SwarmIntegrationService(
        store,
        worktree,
        new SwarmOwnershipService(),
        commands,
      );

      const context = await worktree.create({
        runId: 'run-int',
        taskId: 'cli',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
      });
      const marker = join(context.worktreePath, 'src-feature.txt');
      await writeFile(marker, 'swarm feature\n', 'utf-8');

      const plan: SwarmPlan = {
        id: 'plan-int',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
        goal: 'integrate',
        reasonForSwarm: 'test',
        status: 'approved',
        integrationMode: 'apply_safe',
        runtimePolicy: { kind: 'default' },
        globalConstraints: { maxWorkers: 1 },
        tasks: [{
          id: 'cli',
          title: 'CLI',
          description: 'task',
          dependsOn: [],
          worker: {
            id: 'w1',
            kind: 'ephemeral_agent',
            name: 'engineer',
            role: 'engineer',
            systemPrompt: 'go',
            handoffFormat: { summaryMaxChars: 200, includeDecisions: false, includeTestsRun: false },
          },
          fileOwnership: [{ glob: 'src-feature.txt' }, { glob: '**/*.txt' }],
          allowedTools: ['read_file'],
          injectedSkills: [],
          discoverableSkills: [],
          acceptanceCriteria: [],
          focusedVerification: [],
        }],
        finalVerification: [],
        createdAt: new Date().toISOString(),
      };
      await store.savePlan(plan);

      const run: SwarmRun = {
        id: 'run-int',
        planId: plan.id,
        status: 'completed',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
        integrationMode: 'apply_safe',
        runtimePolicy: { kind: 'default' },
        tasks: [{
          id: 'task-1',
          planTaskId: 'cli',
          status: 'completed',
          workerId: 'w1',
          worktreePath: context.worktreePath,
          branchName: context.branchName,
          handoff: {
            summary: 'done',
            changedFiles: ['src-feature.txt'],
            decisions: [],
            testsRun: [],
            blockers: [],
            expansionRequests: [],
          },
        }],
        createdAt: new Date().toISOString(),
      };
      await store.saveRun(run);

      const { run: updated, summary } = await integration.integrateRun(run.id);
      assert.equal(updated.tasks[0].integration?.status, 'applied');
      assert.equal(updated.tasks[0].status, 'integrated');
      assert.equal(summary.applied, 1);

      const mainFile = await readFile(join(tempDir, 'src-feature.txt'), 'utf-8');
      assert.match(mainFile, /swarm feature/);
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

  test('manual mode leaves changes for review without writing', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cast-swarm-integration-manual-'));
    const previousDb = process.env.CAST_STATE_DB_PATH;
    process.env.CAST_STATE_DB_PATH = join(tempDir, 'state.db');

    try {
      await initGitRepo(tempDir);
      const db = new StateDbService();
      const store = new SwarmRunStoreService(db);
      const commands = new SandboxCommandRunnerService();
      const worktree = new SwarmWorktreeService(commands);
      const integration = new SwarmIntegrationService(store, worktree, new SwarmOwnershipService(), commands);
      const context = await worktree.create({
        runId: 'run-manual',
        taskId: 'cli',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
      });
      await writeFile(join(context.worktreePath, 'manual.txt'), 'pending\n', 'utf-8');

      const plan: SwarmPlan = {
        id: 'plan-manual',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
        goal: 'manual',
        reasonForSwarm: 'test',
        status: 'approved',
        integrationMode: 'manual',
        runtimePolicy: { kind: 'default' },
        globalConstraints: { maxWorkers: 1 },
        tasks: [{
          id: 'cli',
          title: 'CLI',
          description: 'task',
          dependsOn: [],
          worker: {
            id: 'w1',
            kind: 'ephemeral_agent',
            name: 'engineer',
            role: 'engineer',
            systemPrompt: 'go',
            handoffFormat: { summaryMaxChars: 200, includeDecisions: false, includeTestsRun: false },
          },
          fileOwnership: [{ glob: 'manual.txt' }],
          allowedTools: ['read_file'],
          injectedSkills: [],
          discoverableSkills: [],
          acceptanceCriteria: [],
          focusedVerification: [],
        }],
        finalVerification: [],
        createdAt: new Date().toISOString(),
      };
      await store.savePlan(plan);

      const run: SwarmRun = {
        id: 'run-manual',
        planId: plan.id,
        status: 'completed',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
        integrationMode: 'manual',
        runtimePolicy: { kind: 'default' },
        tasks: [{
          id: 'task-1',
          planTaskId: 'cli',
          status: 'completed',
          workerId: 'w1',
          worktreePath: context.worktreePath,
          branchName: context.branchName,
        }],
        createdAt: new Date().toISOString(),
      };
      await store.saveRun(run);

      const { summary } = await integration.integrateRun(run.id);
      assert.equal(summary.manualReview, 1);
      let copied = false;
      try {
        await readFile(join(tempDir, 'manual.txt'), 'utf-8');
        copied = true;
      } catch {
        copied = false;
      }
      assert.equal(copied, false);
      await db.close();
    } finally {
      if (previousDb === undefined) delete process.env.CAST_STATE_DB_PATH;
      else process.env.CAST_STATE_DB_PATH = previousDb;
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('apply_safe integrates tracked edits and new untracked files together', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'cast-swarm-integration-mixed-'));
    const previousDb = process.env.CAST_STATE_DB_PATH;
    process.env.CAST_STATE_DB_PATH = join(tempDir, 'state.db');

    try {
      await initGitRepo(tempDir);
      const db = new StateDbService();
      const store = new SwarmRunStoreService(db);
      const commands = new SandboxCommandRunnerService();
      const worktree = new SwarmWorktreeService(commands);
      const integration = new SwarmIntegrationService(store, worktree, new SwarmOwnershipService(), commands);
      const context = await worktree.create({
        runId: 'run-mixed',
        taskId: 'cli',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
      });

      await writeFile(join(context.worktreePath, 'README.md'), '# swarm integration\n\ntracked change\n', 'utf-8');
      await writeFile(join(context.worktreePath, 'new-feature.txt'), 'new file\n', 'utf-8');

      const plan: SwarmPlan = {
        id: 'plan-mixed',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
        goal: 'mixed integration',
        reasonForSwarm: 'test',
        status: 'approved',
        integrationMode: 'apply_safe',
        runtimePolicy: { kind: 'default' },
        globalConstraints: { maxWorkers: 1 },
        tasks: [{
          id: 'cli',
          title: 'CLI',
          description: 'task',
          dependsOn: [],
          worker: {
            id: 'w1',
            kind: 'ephemeral_agent',
            name: 'engineer',
            role: 'engineer',
            systemPrompt: 'go',
            handoffFormat: { summaryMaxChars: 200, includeDecisions: false, includeTestsRun: false },
          },
          fileOwnership: [{ glob: 'README.md' }, { glob: '*.txt' }],
          allowedTools: ['read_file'],
          injectedSkills: [],
          discoverableSkills: [],
          acceptanceCriteria: [],
          focusedVerification: [],
        }],
        finalVerification: [],
        createdAt: new Date().toISOString(),
      };
      await store.savePlan(plan);

      const run: SwarmRun = {
        id: 'run-mixed',
        planId: plan.id,
        status: 'completed',
        projectRoot: tempDir,
        workspaceRoot: tempDir,
        integrationMode: 'apply_safe',
        runtimePolicy: { kind: 'default' },
        tasks: [{
          id: 'task-1',
          planTaskId: 'cli',
          status: 'completed',
          workerId: 'w1',
          worktreePath: context.worktreePath,
          branchName: context.branchName,
        }],
        createdAt: new Date().toISOString(),
      };
      await store.saveRun(run);

      const { run: updated, summary } = await integration.integrateRun(run.id);

      assert.equal(updated.tasks[0].integration?.status, 'applied');
      assert.equal(summary.applied, 1);
      assert.match(await readFile(join(tempDir, 'README.md'), 'utf-8'), /tracked change/);
      assert.equal(await readFile(join(tempDir, 'new-feature.txt'), 'utf-8'), 'new file\n');
      await db.close();
    } finally {
      if (previousDb === undefined) delete process.env.CAST_STATE_DB_PATH;
      else process.env.CAST_STATE_DB_PATH = previousDb;
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
