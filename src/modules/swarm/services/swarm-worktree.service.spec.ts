import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, test } from 'node:test';
import { SandboxCommandRunnerService } from '../../sandbox/services/sandbox-command-runner.service';
import { SwarmWorktreeService } from './swarm-worktree.service';

const exec = promisify(execFile);

describe('SwarmWorktreeService', () => {
  test('creates a branch-backed worktree under .cast/worktrees', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cast-swarm-worktree-'));
    try {
      await exec('git', ['init'], { cwd: root });
      await exec('git', ['config', 'user.email', 'swarm@test.local'], { cwd: root });
      await exec('git', ['config', 'user.name', 'Swarm Test'], { cwd: root });
      await writeFile(join(root, 'README.md'), '# worktree\n', 'utf-8');
      await exec('git', ['add', '.'], { cwd: root });
      await exec('git', ['commit', '-m', 'init'], { cwd: root });

      const service = new SwarmWorktreeService(new SandboxCommandRunnerService());
      const context = await service.create({
        runId: 'run-abc',
        taskId: 'backend',
        projectRoot: root,
        workspaceRoot: root,
      });

      assert.match(context.branchName, /cast\/swarm\/run-abc\/backend/);
      assert.ok(context.worktreePath.includes('.cast/worktrees/run-abc/backend'));
      const capture = await service.captureDiff(context.worktreePath);
      assert.equal(typeof capture.diff, 'string');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
