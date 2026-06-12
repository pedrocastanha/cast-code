import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, test } from 'node:test';
import { BranchSplitService, BranchSplitGroup } from './branch-split.service';

const tmpDirs: string[] = [];
after(() => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8' });
}

/** Repo with main + feature branch containing `fileCount` changed files. */
function makeFixtureRepo(fileCount: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-split-'));
  tmpDirs.push(dir);
  git(dir, 'init -q -b main');
  git(dir, 'config user.email t@t.dev');
  git(dir, 'config user.name t');
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, 'add -A');
  git(dir, 'commit -qm base');
  git(dir, 'checkout -qb feature');
  for (let i = 0; i < fileCount; i++) {
    const sub = i % 2 === 0 ? 'auth' : 'billing';
    fs.mkdirSync(path.join(dir, 'src', sub), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', sub, `f${i}.ts`), `export const v${i} = ${i};\n`);
  }
  fs.writeFileSync(path.join(dir, 'base.txt'), 'modified\n');
  git(dir, 'add -A');
  git(dir, 'commit -qm "feature work"');
  return dir;
}

function makeService(): BranchSplitService {
  // llmClientFactory only needed for grouping; diff analysis is pure git.
  return new BranchSplitService(undefined as never);
}

describe('BranchSplitService.analyzeDiff', () => {
  test('returns base, current branch and changed files vs target', () => {
    const dir = makeFixtureRepo(6);
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    assert.equal(analysis.current, 'feature');
    assert.equal(analysis.files.length, 7); // 6 new + base.txt modified
    assert.ok(analysis.files.some((f) => f.status === 'A' && f.path === 'src/auth/f0.ts'));
    assert.ok(analysis.files.some((f) => f.status === 'M' && f.path === 'base.txt'));
    assert.equal(analysis.base, git(dir, 'merge-base main feature').trim());
  });

  test('throws on dirty working tree', () => {
    const dir = makeFixtureRepo(2);
    fs.writeFileSync(path.join(dir, 'dirty.txt'), 'x');
    const service = makeService();
    assert.throws(() => service.analyzeDiff('main', dir), /working tree/i);
  });

  test('throws when target equals current branch', () => {
    const dir = makeFixtureRepo(2);
    const service = makeService();
    assert.throws(() => service.analyzeDiff('feature', dir), /current branch/i);
  });

  test('throws when target branch does not exist', () => {
    const dir = makeFixtureRepo(2);
    const service = makeService();
    assert.throws(() => service.analyzeDiff('nope', dir), /not found/i);
  });
});
