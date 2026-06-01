import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { SandboxCommandRunnerService } from './sandbox-command-runner.service';
import { GitWorktreeSandboxService } from './git-worktree-sandbox.service';

const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] });

describe('GitWorktreeSandboxService', () => {
  test('creates an isolated worktree, captures its diff, and disposes it safely', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cast-git-worktree-sandbox-'));
    try {
      git(root, ['init']);
      git(root, ['config', 'user.email', 'cast@example.com']);
      git(root, ['config', 'user.name', 'Cast Test']);
      await writeFile(join(root, '.gitignore'), '.cast\n');
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'app.ts'), 'export const value = "original";\n');
      git(root, ['add', '.']);
      git(root, ['commit', '-m', 'initial']);

      const service = new GitWorktreeSandboxService(new SandboxCommandRunnerService());
      const context = await service.prepare({ runId: 'run-1', projectRoot: root, config: { mode: 'git-worktree' } });
      await writeFile(join(context.root, 'src', 'app.ts'), 'export const value = "sandbox";\n');
      const capture = await service.capture(context);
      await service.dispose(context);

      assert.equal(context.mode, 'git-worktree');
      assert.notEqual(context.root, root);
      assert.match(capture.diff ?? '', /sandbox/);
      assert.equal(existsSync(context.root), false);
      assert.equal(existsSync(join(root, 'src', 'app.ts')), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
