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

describe('BranchSplitService.validateGroups', () => {
  const files = Array.from({ length: 12 }, (_, i) => `f${i}.ts`);
  const service = makeService();

  test('accepts a complete partition', () => {
    const groups: BranchSplitGroup[] = [
      { name: 'a', responsibility: 'r1', commit: 'feat: a', files: files.slice(0, 6) },
      { name: 'b', responsibility: 'r2', commit: 'feat: b', files: files.slice(6) },
    ];
    assert.deepEqual(service.validateGroups(groups, files), []);
  });

  test('reports missing and duplicated files', () => {
    const groups: BranchSplitGroup[] = [
      { name: 'a', responsibility: 'r', commit: 'c', files: ['f0.ts', 'f1.ts'] },
      { name: 'b', responsibility: 'r', commit: 'c', files: ['f1.ts'] },
    ];
    const errors = service.validateGroups(groups, ['f0.ts', 'f1.ts', 'f2.ts']);
    assert.ok(errors.some((e) => e.includes('f2.ts')));      // missing
    assert.ok(errors.some((e) => e.includes('f1.ts')));      // duplicated
  });
});

describe('BranchSplitService.normalizeGroupSizes', () => {
  const service = makeService();
  const mkGroup = (name: string, n: number): BranchSplitGroup => ({
    name, responsibility: name, commit: `feat: ${name}`,
    files: Array.from({ length: n }, (_, i) => `${name}/${i}.ts`),
  });

  test('merges undersized groups into the smallest sibling', () => {
    const result = service.normalizeGroupSizes([mkGroup('big', 10), mkGroup('tiny', 2), mkGroup('small', 4)]);
    assert.equal(result.length, 2);
    const sizes = result.map((g) => g.files.length).sort((a, b) => a - b);
    assert.deepEqual(sizes, [6, 10]); // tiny+small merged
    assert.equal(result.reduce((n, g) => n + g.files.length, 0), 16);
  });

  test('keeps a single undersized group when nothing to merge with', () => {
    const result = service.normalizeGroupSizes([mkGroup('only', 3)]);
    assert.equal(result.length, 1);
  });

  test('leaves well-sized groups alone', () => {
    const result = service.normalizeGroupSizes([mkGroup('a', 7), mkGroup('b', 8)]);
    assert.equal(result.length, 2);
  });
});

describe('BranchSplitService.createBranches', () => {
  test('creates one branch per group from merge-base containing only its files', () => {
    const dir = makeFixtureRepo(8); // 8 new files + base.txt modified = 9
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const groups: BranchSplitGroup[] = [
      { name: 'auth', responsibility: 'auth files', commit: 'feat: auth files',
        files: analysis.files.filter((f) => f.path.startsWith('src/auth/')).map((f) => f.path) },
      { name: 'rest', responsibility: 'everything else', commit: 'feat: rest',
        files: analysis.files.filter((f) => !f.path.startsWith('src/auth/')).map((f) => f.path) },
    ];

    const created = service.createBranches(analysis, groups, dir);

    assert.equal(created.length, 2);
    assert.equal(created[0].branch, 'feature--split/1-auth');
    const diff = git(dir, `diff --name-only ${analysis.base}..feature--split/1-auth`).split('\n').filter(Boolean);
    assert.deepEqual(diff.sort(), [...groups[0].files].sort());
    assert.equal(git(dir, 'branch --show-current').trim(), 'feature');
    assert.equal(git(dir, 'rev-parse HEAD').trim(), analysis.headSha);
    assert.ok(!git(dir, 'worktree list').includes('branch-split-wt'));
  });

  test('handles deletions', () => {
    const dir = makeFixtureRepo(5);
    git(dir, 'rm -q base.txt');
    git(dir, 'commit -qm "remove base"');
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const groups: BranchSplitGroup[] = [
      { name: 'all', responsibility: 'all', commit: 'feat: all', files: analysis.files.map((f) => f.path) },
    ];
    const created = service.createBranches(analysis, groups, dir);
    const lsTree = git(dir, `ls-tree -r --name-only ${created[0].branch}`);
    assert.ok(!lsTree.includes('base.txt'));
  });

  test('refuses when split branches already exist without force', () => {
    const dir = makeFixtureRepo(5);
    git(dir, 'branch feature--split/1-old');
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    assert.throws(
      () => service.createBranches(analysis, [{ name: 'x', responsibility: 'x', commit: 'c', files: ['base.txt'] }], dir),
      /already exist/i,
    );
    const created = service.createBranches(
      analysis, [{ name: 'x', responsibility: 'x', commit: 'feat: x', files: ['base.txt'] }], dir, { force: true },
    );
    assert.equal(created.length, 1);
    assert.ok(!git(dir, 'branch --list "feature--split/*"').includes('1-old'));
  });
});

describe('BranchSplitService.writeArtifacts', () => {
  test('writes README, manifest and one PR.md per branch; gitignores .branches/', () => {
    const dir = makeFixtureRepo(5);
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const created = [
      { branch: 'feature--split/1-auth', dir: 'feature--split__1-auth', commit: 'feat: auth',
        responsibility: 'auth', files: ['src/auth/f0.ts'], title: 'feat: auth' },
    ];
    service.writeArtifacts(analysis, created, [
      { title: 'feat: auth', description: '## Summary\nauth changes' },
    ], dir);

    const root = path.join(dir, '.branches');
    assert.ok(fs.existsSync(path.join(root, 'README.md')));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.current, 'feature');
    assert.equal(manifest.branches[0].branch, 'feature--split/1-auth');
    const prMd = fs.readFileSync(path.join(root, 'feature--split__1-auth', 'PR.md'), 'utf-8');
    assert.match(prMd, /feat: auth/);
    assert.match(prMd, /gh pr create --base feature --head "feature--split\/1-auth"/);
    assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8'), /\.branches\//);
  });
});
