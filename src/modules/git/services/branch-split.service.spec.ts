import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, test } from 'node:test';
import { BranchSplitService, BranchSplitGroup, HunkPiece } from './branch-split.service';

const tmpDirs: string[] = [];
after(() => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8' });
}

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-split-'));
  tmpDirs.push(dir);
  git(dir, 'init -q -b main');
  git(dir, 'config user.email t@t.dev');
  git(dir, 'config user.name t');
  return dir;
}

function makeService(): BranchSplitService {
  return new BranchSplitService(undefined as never);
}

/** main has a 20-line app.ts; feature edits the top and bottom (two hunks) and adds feature.ts. */
function makeHunkRepo(): string {
  const dir = initRepo();
  const base = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'app.ts'), base);
  git(dir, 'add -A');
  git(dir, 'commit -qm base');
  git(dir, 'checkout -qb feature');
  const edited = base.replace('line 0', 'line 0 CHANGED').replace('line 19', 'line 19 CHANGED');
  fs.writeFileSync(path.join(dir, 'app.ts'), edited);
  fs.writeFileSync(path.join(dir, 'feature.ts'), 'export const feature = true;\n');
  git(dir, 'add -A');
  git(dir, 'commit -qm "feature work"');
  return dir;
}

/** Simple repo: N one-line files + base.txt modified, each a single hunk. */
function makeFlatRepo(fileCount: number): string {
  const dir = initRepo();
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git(dir, 'add -A');
  git(dir, 'commit -qm base');
  git(dir, 'checkout -qb feature');
  for (let i = 0; i < fileCount; i++) {
    fs.writeFileSync(path.join(dir, `f${i}.ts`), `export const v${i} = ${i};\n`);
  }
  fs.writeFileSync(path.join(dir, 'base.txt'), 'modified\n');
  git(dir, 'add -A');
  git(dir, 'commit -qm "feature work"');
  return dir;
}

describe('BranchSplitService.analyzeDiff', () => {
  test('returns base, current branch, files and per-file hunks', () => {
    const dir = makeHunkRepo();
    const analysis = makeService().analyzeDiff('main', dir);
    assert.equal(analysis.current, 'feature');
    assert.equal(analysis.base, git(dir, 'merge-base main feature').trim());
    const app = analysis.fileDiffs.find((f) => f.file === 'app.ts');
    assert.ok(app);
    assert.equal(app!.status, 'M');
    assert.equal(app!.hunks.length, 2);
    const feat = analysis.fileDiffs.find((f) => f.file === 'feature.ts');
    assert.equal(feat!.status, 'A');
  });

  test('throws on dirty working tree', () => {
    const dir = makeFlatRepo(2);
    fs.writeFileSync(path.join(dir, 'dirty.txt'), 'x');
    assert.throws(() => makeService().analyzeDiff('main', dir), /working tree/i);
  });

  test('throws when target equals current branch', () => {
    const dir = makeFlatRepo(2);
    assert.throws(() => makeService().analyzeDiff('feature', dir), /current branch/i);
  });

  test('throws when target branch does not exist', () => {
    const dir = makeFlatRepo(2);
    assert.throws(() => makeService().analyzeDiff('nope', dir), /not found/i);
  });
});

describe('BranchSplitService.validateGroups', () => {
  const service = makeService();
  const ids = ['a#0', 'a#1', 'b#0'];

  test('accepts a complete hunk partition', () => {
    const groups: BranchSplitGroup[] = [
      { name: 'g1', responsibility: 'r', commit: 'c', hunks: ['a#0', 'b#0'], order: 1, linesAdded: 0, linesDeleted: 0 },
      { name: 'g2', responsibility: 'r', commit: 'c', hunks: ['a#1'], order: 2, linesAdded: 0, linesDeleted: 0 },
    ];
    assert.deepEqual(service.validateGroups(groups, ids), []);
  });

  test('reports missing and duplicated hunks', () => {
    const groups: BranchSplitGroup[] = [
      { name: 'g1', responsibility: 'r', commit: 'c', hunks: ['a#0'], order: 1, linesAdded: 0, linesDeleted: 0 },
      { name: 'g2', responsibility: 'r', commit: 'c', hunks: ['a#0'], order: 2, linesAdded: 0, linesDeleted: 0 },
    ];
    const errors = service.validateGroups(groups, ids);
    assert.ok(errors.some((e) => e.includes('a#1')));
    assert.ok(errors.some((e) => e.includes('a#0')));
    assert.ok(errors.some((e) => e.includes('b#0')));
  });
});

describe('BranchSplitService.normalizeBudget', () => {
  const service = makeService();
  const weights = new Map<string, HunkPiece>([
    ['a#0', { patch: '', added: 50, deleted: 0 }],
    ['b#0', { patch: '', added: 40, deleted: 0 }],
    ['c#0', { patch: '', added: 260, deleted: 0 }],
  ]);
  const mk = (name: string, hunks: string[]): BranchSplitGroup =>
    ({ name, responsibility: name, commit: `feat: ${name}`, hunks, order: 0, linesAdded: 0, linesDeleted: 0 });

  test('merges undersized leading group into the next while under budget', () => {
    const result = service.normalizeBudget([mk('tiny', ['a#0']), mk('small', ['b#0'])], weights);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].hunks.sort(), ['a#0', 'b#0']);
    assert.equal(result[0].order, 1);
  });

  test('keeps a large group standalone and assigns dependency order', () => {
    const result = service.normalizeBudget([mk('big', ['c#0']), mk('tiny', ['a#0'])], weights);
    assert.equal(result.length, 2);
    assert.equal(result[0].order, 1);
    assert.equal(result[0].dependsOn, undefined);
    assert.equal(result[1].order, 2);
    assert.equal(result[1].dependsOn, 1);
  });
});

describe('BranchSplitService.groupHunks', () => {
  function serviceWithLlm(content: string): BranchSplitService {
    const factory = { create: () => ({ invoke: async () => ({ content }) }) };
    return new BranchSplitService(factory as never);
  }

  test('repairs mangled LLM output into a complete disjoint partition', async () => {
    const dir = makeFlatRepo(3);
    const json = JSON.stringify([
      { name: 'a', responsibility: 'r', commit: 'feat: a', hunks: [1, 2, 2, 99] },
      { name: 'b', responsibility: 'r', commit: 'feat: b', hunks: [3] },
    ]);
    const service = serviceWithLlm(json);
    const analysis = service.analyzeDiff('main', dir);
    const groups = await service.groupHunks(analysis, dir);

    const got = groups.flatMap((g) => g.hunks).sort();
    assert.deepEqual(got, [...service.allHunkIds(analysis)].sort());
    assert.deepEqual(service.validateGroups(groups, service.allHunkIds(analysis)), []);
  });

  test('recovers when the model returns no usable hunks', async () => {
    const dir = makeFlatRepo(2);
    const service = serviceWithLlm('not json at all');
    const analysis = service.analyzeDiff('main', dir);
    const groups = await service.groupHunks(analysis, dir);
    assert.deepEqual(service.validateGroups(groups, service.allHunkIds(analysis)), []);
  });
});

describe('BranchSplitService.createStackedBranches', () => {
  test('stacks branches and reconstructs the full diff (hunk-level)', () => {
    const dir = makeHunkRepo();
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const groups: BranchSplitGroup[] = [
      { name: 'top', responsibility: 'top edit', commit: 'feat: top', hunks: ['app.ts#0'], order: 1, linesAdded: 0, linesDeleted: 0 },
      { name: 'rest', responsibility: 'bottom + new file', commit: 'feat: rest', hunks: ['app.ts#1', 'feature.ts#0'], order: 2, dependsOn: 1, linesAdded: 0, linesDeleted: 0 },
    ];

    const created = service.createStackedBranches(analysis, groups, dir);

    assert.equal(created.length, 2);
    assert.equal(created[0].branch, 'feature--split/1-top');
    assert.equal(created[0].base, 'main');
    assert.equal(created[1].base, 'feature--split/1-top');

    assert.equal(git(dir, 'diff feature--split/2-rest..feature').trim(), '');

    const b1 = git(dir, 'diff --name-only main..feature--split/1-top').split('\n').filter(Boolean);
    assert.deepEqual(b1, ['app.ts']);
    const b2 = git(dir, 'diff --name-only feature--split/1-top..feature--split/2-rest').split('\n').filter(Boolean);
    assert.deepEqual(b2.sort(), ['app.ts', 'feature.ts']);

    assert.equal(git(dir, 'branch --show-current').trim(), 'feature');
    assert.equal(git(dir, 'rev-parse HEAD').trim(), analysis.headSha);
    assert.ok(!git(dir, 'worktree list').includes('branch-split-wt'));
  });

  test('handles deletions', () => {
    const dir = makeFlatRepo(3);
    git(dir, 'rm -q base.txt');
    git(dir, 'commit -qm "remove base"');
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const created = service.createStackedBranches(analysis, [
      { name: 'all', responsibility: 'all', commit: 'feat: all', hunks: service.allHunkIds(analysis), order: 1, linesAdded: 0, linesDeleted: 0 },
    ], dir);
    const lsTree = git(dir, `ls-tree -r --name-only ${created[0].branch}`);
    assert.ok(!lsTree.includes('base.txt'));
    assert.equal(git(dir, `diff ${created[0].branch}..feature`).trim(), '');
  });

  test('rolls back created branches when a slice fails', () => {
    const dir = makeFlatRepo(3);
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const all = service.allHunkIds(analysis);
    const groups: BranchSplitGroup[] = [
      { name: 'good', responsibility: 'good', commit: 'feat: good', hunks: [all[0]], order: 1, linesAdded: 0, linesDeleted: 0 },
      { name: 'bad', responsibility: 'bad', commit: 'feat: bad', hunks: [`${all[1].split('#')[0]}#99`], order: 2, dependsOn: 1, linesAdded: 0, linesDeleted: 0 },
    ];
    assert.throws(() => service.createStackedBranches(analysis, groups, dir));
    assert.equal(git(dir, 'branch --list "feature--split/*"').trim(), '');
  });

  test('refuses when split branches already exist without force', () => {
    const dir = makeFlatRepo(3);
    git(dir, 'branch feature--split/1-old');
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const group: BranchSplitGroup = { name: 'x', responsibility: 'x', commit: 'feat: x', hunks: service.allHunkIds(analysis), order: 1, linesAdded: 0, linesDeleted: 0 };
    assert.throws(() => service.createStackedBranches(analysis, [group], dir), /already exist/i);
    const created = service.createStackedBranches(analysis, [group], dir, { force: true });
    assert.equal(created.length, 1);
    assert.ok(!git(dir, 'branch --list "feature--split/*"').includes('1-old'));
  });
});

describe('BranchSplitService.writeArtifacts', () => {
  test('writes README, manifest v2 with bases and one PR.md per branch', () => {
    const dir = makeFlatRepo(3);
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const created = service.createStackedBranches(analysis, [
      { name: 'first', responsibility: 'first', commit: 'feat: first', hunks: [service.allHunkIds(analysis)[0]], order: 1, linesAdded: 0, linesDeleted: 0 },
      { name: 'rest', responsibility: 'rest', commit: 'feat: rest', hunks: service.allHunkIds(analysis).slice(1), order: 2, dependsOn: 1, linesAdded: 0, linesDeleted: 0 },
    ], dir);
    service.writeArtifacts(analysis, created, [
      { title: 'feat: first', description: '## Summary\nfirst' },
      { title: 'feat: rest', description: '## Summary\nrest' },
    ], dir);

    const root = path.join(dir, '.branches');
    assert.ok(fs.existsSync(path.join(root, 'README.md')));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.version, 2);
    assert.equal(manifest.branches[0].base, 'main');
    assert.equal(manifest.branches[1].base, 'feature--split/1-first');
    const prMd = fs.readFileSync(path.join(root, manifest.branches[1].dir, 'PR.md'), 'utf-8');
    assert.match(prMd, /Depends on/);
    assert.match(prMd, /gh pr create --base "feature--split\/1-first" --head "feature--split\/2-rest"/);
    assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8'), /\.branches\//);
  });
});

function installFakeGh(dir: string, log: string): string {
  const binDir = path.join(dir, 'fakebin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'gh'), [
    '#!/bin/sh',
    `echo "$@" >> "${log}"`,
    'case "$1 $2" in',
    '  "auth status") exit 0 ;;',
    '  "pr list") echo "[]" ;;',
    '  "pr create") echo "https://github.com/o/r/pull/7" ;;',
    'esac',
    'exit 0',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(binDir, 'git'), `#!/bin/sh\necho "git $@" >> "${log}"\nexit 0\n`, { mode: 0o755 });
  return binDir;
}

describe('BranchSplitService.createPullRequests', () => {
  test('opens PRs along the stack, PR1 based on target', async () => {
    const dir = makeFlatRepo(3);
    const service = makeService();
    const analysis = service.analyzeDiff('main', dir);
    const created = service.createStackedBranches(analysis, [
      { name: 'all', responsibility: 'all', commit: 'feat: all', hunks: service.allHunkIds(analysis), order: 1, linesAdded: 0, linesDeleted: 0 },
    ], dir);
    service.writeArtifacts(analysis, created, [{ title: 'feat: all', description: 'd' }], dir);

    const log = path.join(dir, 'gh.log');
    const binDir = installFakeGh(dir, log);
    const result = await service.createPullRequests(dir, { env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` } });

    assert.equal(result.created.length, 1);
    assert.equal(result.failed.length, 0);
    assert.equal(result.created[0].prUrl, 'https://github.com/o/r/pull/7');
    const logged = fs.readFileSync(log, 'utf-8');
    assert.match(logged, /pr create --base main --head feature--split\/1-all/);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.branches', 'manifest.json'), 'utf-8'));
    assert.equal(manifest.branches[0].prUrl, 'https://github.com/o/r/pull/7');
  });

  test('fails fast without a manifest', async () => {
    const dir = makeFlatRepo(2);
    await assert.rejects(() => makeService().createPullRequests(dir), /branch-split first/i);
  });
});
