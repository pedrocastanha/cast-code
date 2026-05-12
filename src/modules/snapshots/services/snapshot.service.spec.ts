import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { SnapshotService } from './snapshot.service';

const withSnapshots = async (run: (context: { root: string; snapshots: SnapshotService }) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'cast-snapshot-service-'));
  const previousDir = process.env.CAST_SNAPSHOTS_DIR;
  process.env.CAST_SNAPSHOTS_DIR = join(root, 'snapshots');

  try {
    const snapshots = new SnapshotService();
    await run({ root, snapshots });
  } finally {
    if (previousDir === undefined) {
      delete process.env.CAST_SNAPSHOTS_DIR;
    } else {
      process.env.CAST_SNAPSHOTS_DIR = previousDir;
    }
    await rm(root, { recursive: true, force: true });
  }
};

describe('SnapshotService checkpoints', () => {
  test('snapshots project files and rolls back a checkpoint', async () => {
    await withSnapshots(async ({ root, snapshots }) => {
      await mkdir(join(root, 'src'), { recursive: true });
      await mkdir(join(root, '.cast'), { recursive: true });
      await writeFile(join(root, 'src', 'campaign.txt'), 'original campaign');
      await writeFile(join(root, '.cast', 'ignored.txt'), 'ignored');

      const checkpoint = snapshots.saveCheckpoint(root, 'run-1');
      await writeFile(join(root, 'src', 'campaign.txt'), 'mutated campaign');

      assert.equal(checkpoint.checkpointId, 'run-1');
      assert.equal(checkpoint.files.length, 1);
      assert.equal(snapshots.rollbackCheckpoint('run-1'), true);
      assert.equal(await readFile(join(root, 'src', 'campaign.txt'), 'utf-8'), 'original campaign');
    });
  });

  test('rollback removes files created after the checkpoint while preserving .cast artifacts', async () => {
    await withSnapshots(async ({ root, snapshots }) => {
      await mkdir(join(root, 'src'), { recursive: true });
      await mkdir(join(root, '.cast'), { recursive: true });
      await writeFile(join(root, 'src', 'existing.txt'), 'original');

      snapshots.saveCheckpoint(root, 'run-cleanup');
      await writeFile(join(root, 'src', 'existing.txt'), 'mutated');
      await writeFile(join(root, 'src', 'generated-wrapper.ts'), 'generated');
      await writeFile(join(root, '.cast', 'sandbox-summary.json'), '{}');

      assert.equal(snapshots.rollbackCheckpoint('run-cleanup'), true);
      assert.equal(await readFile(join(root, 'src', 'existing.txt'), 'utf-8'), 'original');
      assert.equal(existsSync(join(root, 'src', 'generated-wrapper.ts')), false);
      assert.equal(existsSync(join(root, '.cast', 'sandbox-summary.json')), true);
    });
  });

  test('git checkpoints include existing untracked non-ignored files', async () => {
    await withSnapshots(async ({ root, snapshots }) => {
      await writeFile(join(root, '.gitignore'), 'ignored.txt\n');
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'tracked.txt'), 'tracked');
      await writeFile(join(root, 'src', 'untracked.txt'), 'untracked');
      await writeFile(join(root, 'ignored.txt'), 'ignored');
      await mkdir(join(root, '.cast'), { recursive: true });
      await writeFile(join(root, '.cast', 'artifact.json'), '{}');
      await writeFile(join(root, 'snapshots', 'internal.snap'), 'snapshot');

      const { execFileSync } = await import('node:child_process');
      execFileSync('git', ['init'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['config', 'user.email', 'cast@example.com'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['config', 'user.name', 'Cast Test'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['add', '.gitignore', 'src/tracked.txt'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });

      const checkpoint = snapshots.saveCheckpoint(root, 'run-git');

      assert(checkpoint.manifest?.some((filePath) => filePath.endsWith(join('src', 'tracked.txt'))));
      assert(checkpoint.manifest?.some((filePath) => filePath.endsWith(join('src', 'untracked.txt'))));
      assert.equal(checkpoint.manifest?.some((filePath) => filePath.endsWith('ignored.txt')), false);
      assert.equal(checkpoint.manifest?.some((filePath) => filePath.includes(`${join('.cast', '')}`)), false);
      assert.equal(checkpoint.manifest?.some((filePath) => filePath.includes(`${join('snapshots', '')}`)), false);
    });
  });

  test('rollback removes ignored files created after a checkpoint in git projects', async () => {
    await withSnapshots(async ({ root, snapshots }) => {
      await writeFile(join(root, '.gitignore'), '.env\n');
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'tracked.txt'), 'tracked');

      const { execFileSync } = await import('node:child_process');
      execFileSync('git', ['init'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['config', 'user.email', 'cast@example.com'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['config', 'user.name', 'Cast Test'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['add', '.gitignore', 'src/tracked.txt'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });

      snapshots.saveCheckpoint(root, 'run-ignored-cleanup');
      await writeFile(join(root, '.env'), 'OPENAI_API_KEY=sk-test-created-after-checkpoint');

      assert.equal(snapshots.rollbackCheckpoint('run-ignored-cleanup'), true);
      assert.equal(existsSync(join(root, '.env')), false);
    });
  });

  test('rollback preserves ignored files that existed before a git checkpoint', async () => {
    await withSnapshots(async ({ root, snapshots }) => {
      await writeFile(join(root, '.gitignore'), '.env\n');
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'tracked.txt'), 'tracked');
      await writeFile(join(root, '.env'), 'OPENAI_API_KEY=sk-existing-before-checkpoint');

      const { execFileSync } = await import('node:child_process');
      execFileSync('git', ['init'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['config', 'user.email', 'cast@example.com'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['config', 'user.name', 'Cast Test'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['add', '.gitignore', 'src/tracked.txt'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });

      snapshots.saveCheckpoint(root, 'run-preserve-ignored');
      await writeFile(join(root, 'src', 'tracked.txt'), 'mutated');

      assert.equal(snapshots.rollbackCheckpoint('run-preserve-ignored'), true);
      assert.equal(await readFile(join(root, '.env'), 'utf-8'), 'OPENAI_API_KEY=sk-existing-before-checkpoint');
      assert.equal(await readFile(join(root, 'src', 'tracked.txt'), 'utf-8'), 'tracked');
    });
  });

  test('rollback removes new files under ignored build directories while preserving existing ones', async () => {
    await withSnapshots(async ({ root, snapshots }) => {
      await mkdir(join(root, 'src'), { recursive: true });
      await mkdir(join(root, 'dist'), { recursive: true });
      await writeFile(join(root, 'src', 'tracked.txt'), 'tracked');
      await writeFile(join(root, 'dist', 'existing.js'), 'before');

      snapshots.saveCheckpoint(root, 'run-build-dir-cleanup');
      await writeFile(join(root, 'dist', 'generated.js'), 'after');

      assert.equal(snapshots.rollbackCheckpoint('run-build-dir-cleanup'), true);
      assert.equal(await readFile(join(root, 'dist', 'existing.js'), 'utf-8'), 'before');
      assert.equal(existsSync(join(root, 'dist', 'generated.js')), false);
    });
  });

  test('lists checkpoints by newest timestamp first', async () => {
    await withSnapshots(async ({ root, snapshots }) => {
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'one.txt'), 'one');
      snapshots.saveCheckpoint(root, 'older');

      await writeFile(join(root, 'src', 'two.txt'), 'two');
      snapshots.saveCheckpoint(root, 'newer');

      const checkpoints = snapshots.listCheckpoints();
      assert.deepEqual(checkpoints.map((checkpoint) => checkpoint.checkpointId), ['newer', 'older']);
      assert.equal(checkpoints[0].files.length, 2);
    });
  });
});
