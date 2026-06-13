import { Injectable } from '@nestjs/common';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LlmClientFactory } from '../../../common/services/llm-client.factory';
import { extractText } from '../../../common/types/llm.types';
import { BRANCH_SPLIT_SYSTEM_PROMPT, buildBranchSplitPrompt } from './branch-split-prompts';

export interface ChangedFile {
  status: 'A' | 'M' | 'D' | 'R';
  path: string;
  /** Original path for renames. */
  fromPath?: string;
}

export interface DiffAnalysis {
  current: string;
  target: string;
  base: string;     // merge-base sha
  headSha: string;
  files: ChangedFile[];
}

export interface BranchSplitGroup {
  name: string;            // kebab slug
  responsibility: string;  // one line
  commit: string;          // conventional commit message
  files: string[];         // paths from DiffAnalysis.files
}

export interface CreatedBranch {
  branch: string;
  dir: string;             // .branches/<dir>/
  commit: string;
  responsibility: string;
  files: string[];
  title?: string;
  prUrl?: string;
}

export interface BranchSplitManifest {
  version: 1;
  createdAt: string;
  current: string;
  target: string;
  base: string;
  branches: CreatedBranch[];
}

export const MAX_FILES_PER_BRANCH = 20;
export const MIN_FILES_PER_BRANCH = 5;

@Injectable()
export class BranchSplitService {
  constructor(private readonly llmClientFactory: LlmClientFactory) {}

  private git(cwd: string, args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' });
  }

  analyzeDiff(target: string, cwd: string = process.cwd()): DiffAnalysis {
    const status = this.git(cwd, ['status', '--porcelain']);
    if (status.trim().length > 0) {
      throw new Error('Working tree is not clean. Commit or stash your changes before /branch-split.');
    }

    const current = this.git(cwd, ['branch', '--show-current']).trim();
    if (current === target) {
      throw new Error(`Target "${target}" is the current branch. Pick the branch you eventually merge into.`);
    }

    try {
      this.git(cwd, ['rev-parse', '--verify', '--quiet', target]);
    } catch {
      throw new Error(`Target branch not found: ${target}`);
    }

    const base = this.git(cwd, ['merge-base', target, 'HEAD']).trim();
    const headSha = this.git(cwd, ['rev-parse', 'HEAD']).trim();

    const raw = this.git(cwd, ['diff', '--name-status', '-M', `${base}..HEAD`]);
    const files: ChangedFile[] = raw.split('\n').filter(Boolean).map((line) => {
      const parts = line.split('\t');
      const code = parts[0][0] as ChangedFile['status'];
      if (code === 'R') {
        return { status: 'R', fromPath: parts[1], path: parts[2] };
      }
      return { status: code === 'A' || code === 'M' || code === 'D' ? code : 'M', path: parts[1] };
    });

    return { current, target, base, headSha, files };
  }

  validateGroups(groups: BranchSplitGroup[], allFiles: string[]): string[] {
    const errors: string[] = [];
    const seen = new Map<string, number>();
    for (const group of groups) {
      if (group.files.length === 0) errors.push(`group "${group.name}" is empty`);
      for (const file of group.files) {
        seen.set(file, (seen.get(file) ?? 0) + 1);
        if (!allFiles.includes(file)) errors.push(`unknown file in group "${group.name}": ${file}`);
      }
    }
    for (const file of allFiles) {
      const count = seen.get(file) ?? 0;
      if (count === 0) errors.push(`file missing from all groups: ${file}`);
      if (count > 1) errors.push(`file in multiple groups: ${file}`);
    }
    return errors;
  }

  normalizeGroupSizes(groups: BranchSplitGroup[]): BranchSplitGroup[] {
    const result = groups.map((g) => ({ ...g, files: [...g.files] }));
    while (result.length > 1) {
      result.sort((a, b) => a.files.length - b.files.length);
      if (result[0].files.length >= MIN_FILES_PER_BRANCH) break;
      const [smallest, nextSmallest] = result;
      nextSmallest.files.push(...smallest.files);
      nextSmallest.responsibility = `${nextSmallest.responsibility}; ${smallest.responsibility}`;
      result.shift();
    }
    return result;
  }

  async groupFiles(analysis: DiffAnalysis, cwd: string = process.cwd()): Promise<BranchSplitGroup[]> {
    const diffStat = this.git(cwd, ['diff', '--stat', `${analysis.base}..HEAD`]);
    const llm = this.llmClientFactory.create('cheap');
    const allPaths = analysis.files.map((f) => f.path);

    let lastErrors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const retryNote = lastErrors.length > 0
        ? `\n\nYour previous answer had these errors, fix them:\n${lastErrors.join('\n')}`
        : '';
      const response = await llm.invoke([
        { role: 'system', content: BRANCH_SPLIT_SYSTEM_PROMPT },
        { role: 'user', content: buildBranchSplitPrompt(analysis.files, diffStat) + retryNote },
      ]);
      const groups = this.parseGroups(extractText(response));
      if (!groups) { lastErrors = ['response was not a valid JSON array of groups']; continue; }
      lastErrors = this.validateGroups(groups, allPaths);
      if (lastErrors.length === 0) return this.normalizeGroupSizes(groups);
    }
    throw new Error(`Could not produce a valid file grouping:\n${lastErrors.join('\n')}`);
  }

  private parseGroups(content: string): BranchSplitGroup[] | null {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) return null;
      return parsed.map((g) => ({
        name: String(g.name ?? 'group').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'group',
        responsibility: String(g.responsibility ?? ''),
        commit: String(g.commit ?? 'chore: split changes'),
        files: Array.isArray(g.files) ? g.files.map(String) : [],
      }));
    } catch {
      return null;
    }
  }

  splitBranchName(current: string, index: number, slug: string): string {
    return `${current}--split/${index}-${slug}`;
  }

  /** Maps branch name to a filesystem-safe .branches/ directory name. */
  branchDirName(branch: string): string {
    return branch.replace(/\//g, '__');
  }

  createBranches(
    analysis: DiffAnalysis,
    groups: BranchSplitGroup[],
    cwd: string = process.cwd(),
    opts: { force?: boolean } = {},
  ): CreatedBranch[] {
    const existing = this.git(cwd, ['branch', '--list', `${analysis.current}--split/*`])
      .split('\n').map((l) => l.replace(/^[*+ ]+/, '').trim()).filter(Boolean);
    if (existing.length > 0) {
      if (!opts.force) {
        throw new Error(
          `Split branches already exist (${existing.join(', ')}). Re-run with --force to recreate them.`,
        );
      }
      for (const branch of existing) this.git(cwd, ['branch', '-D', branch]);
    }

    const created: CreatedBranch[] = [];
    const byPath = new Map(analysis.files.map((f) => [f.path, f]));

    groups.forEach((group, i) => {
      const branch = this.splitBranchName(analysis.current, i + 1, group.name);
      this.git(cwd, ['branch', branch, analysis.base]);

      // mkdtemp creates the dir; git worktree add wants a non-existing path → use a subpath.
      const worktreeParent = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-split-wt-'));
      const worktree = path.join(worktreeParent, 'wt');
      try {
        this.git(cwd, ['worktree', 'add', '--quiet', worktree, branch]);
        for (const file of group.files) {
          const change = byPath.get(file);
          if (change?.status === 'D') {
            this.git(worktree, ['rm', '-q', '--', file]);
          } else {
            if (change?.status === 'R' && change.fromPath) {
              try { this.git(worktree, ['rm', '-q', '--', change.fromPath]); } catch { /* not at base */ }
            }
            this.git(worktree, ['checkout', analysis.headSha, '--', file]);
          }
        }
        this.git(worktree, ['commit', '-q', '-m', group.commit]);
      } finally {
        try { this.git(cwd, ['worktree', 'remove', '--force', worktree]); } catch { /* best-effort */ }
        fs.rmSync(worktreeParent, { recursive: true, force: true });
      }

      created.push({
        branch,
        dir: this.branchDirName(branch),
        commit: group.commit,
        responsibility: group.responsibility,
        files: group.files,
      });
    });

    return created;
  }

  writeArtifacts(
    analysis: DiffAnalysis,
    branches: CreatedBranch[],
    prDescriptions: Array<{ title: string; description: string }>,
    cwd: string = process.cwd(),
  ): void {
    const root = path.join(cwd, '.branches');
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });

    branches.forEach((entry, i) => {
      entry.title = prDescriptions[i]?.title ?? entry.commit;
      const branchDir = path.join(root, entry.dir);
      fs.mkdirSync(branchDir, { recursive: true });
      fs.writeFileSync(path.join(branchDir, 'PR.md'), [
        `# ${entry.title}`,
        '',
        `> PR: \`${entry.branch}\` → \`${analysis.current}\``,
        '',
        prDescriptions[i]?.description ?? entry.responsibility,
        '',
        '## Files in this branch',
        '',
        ...entry.files.map((f) => `- \`${f}\``),
        '',
        '## How to open this PR',
        '',
        '```bash',
        `git push -u origin "${entry.branch}"`,
        `gh pr create --base ${analysis.current} --head "${entry.branch}" --title "${entry.title.replace(/"/g, '\\"')}" --body-file ".branches/${entry.dir}/PR.md"`,
        '```',
        '',
        `Or run \`cast branch-split-create\` to push and open every PR automatically.`,
        '',
      ].join('\n'));
    });

    const manifest: BranchSplitManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      current: analysis.current,
      target: analysis.target,
      base: analysis.base,
      branches,
    };
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));

    fs.writeFileSync(path.join(root, 'README.md'), [
      `# Branch split of \`${analysis.current}\``,
      '',
      `Target: \`${analysis.target}\` · base: \`${analysis.base.slice(0, 8)}\` · created ${manifest.createdAt}`,
      '',
      'Each sub-branch below holds one reviewable slice of this branch, cut from the merge-base.',
      `PRs open against \`${analysis.current}\`; GitHub shows only each slice's diff. Merging them into`,
      `\`${analysis.current}\` is a no-op (the content is already here) — they exist for review granularity.`,
      `The final merge to \`${analysis.target}\` happens through \`${analysis.current}\` as usual.`,
      '',
      '| # | Branch | Responsibility | Files | PR doc |',
      '|---|--------|----------------|-------|--------|',
      ...branches.map((b, i) =>
        `| ${i + 1} | \`${b.branch}\` | ${b.responsibility} | ${b.files.length} | [PR.md](./${b.dir}/PR.md) |`),
      '',
      'Open all PRs: `cast branch-split-create` (requires `gh` authenticated).',
      '',
    ].join('\n'));

    this.ensureGitignored(cwd);
  }

  private ensureGitignored(cwd: string): void {
    const gitignorePath = path.join(cwd, '.gitignore');
    const current = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
    if (!current.split('\n').some((l) => l.trim() === '.branches/')) {
      fs.writeFileSync(gitignorePath, `${current.replace(/\n*$/, '\n')}\n.branches/\n`);
    }
  }

  async createPullRequests(
    cwd: string = process.cwd(),
    opts: { env?: NodeJS.ProcessEnv } = {},
  ): Promise<{ created: CreatedBranch[]; failed: Array<{ branch: string; error: string }> }> {
    const manifestPath = path.join(cwd, '.branches', 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('No .branches/manifest.json found. Run /branch-split first.');
    }
    const manifest: BranchSplitManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const env = opts.env ?? process.env;
    const run = (cmd: string, args: string[]): string =>
      execFileSync(cmd, args, { cwd, encoding: 'utf-8', env });

    try {
      run('gh', ['auth', 'status']);
    } catch {
      throw new Error('GitHub CLI not authenticated. Run: gh auth login');
    }

    const currentBase = run('git', ['merge-base', manifest.target, manifest.current]).trim();
    if (currentBase && currentBase !== manifest.base) {
      process.stdout.write(`  Warning: merge-base moved since the split (${manifest.base.slice(0, 8)} → ${currentBase.slice(0, 8)}).\n`);
    }

    run('git', ['push', '-u', 'origin', manifest.current]);

    const created: CreatedBranch[] = [];
    const failed: Array<{ branch: string; error: string }> = [];

    for (const entry of manifest.branches) {
      try {
        if (entry.prUrl) { created.push(entry); continue; } // idempotent re-run
        const existing = run('gh', ['pr', 'list', '--head', entry.branch, '--json', 'url']).trim();
        if (existing && existing !== '[]') {
          entry.prUrl = (JSON.parse(existing)[0]?.url as string) ?? entry.prUrl;
          created.push(entry);
          continue;
        }
        run('git', ['push', '-u', 'origin', entry.branch]);
        const url = run('gh', [
          'pr', 'create',
          '--base', manifest.current,
          '--head', entry.branch,
          '--title', entry.title ?? entry.commit,
          '--body-file', path.join('.branches', entry.dir, 'PR.md'),
        ]).trim();
        entry.prUrl = url.split('\n').pop() ?? url;
        created.push(entry);
      } catch (error) {
        failed.push({ branch: entry.branch, error: error instanceof Error ? error.message : String(error) });
      }
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return { created, failed };
  }
}
