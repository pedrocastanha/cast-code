import { Injectable } from '@nestjs/common';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LlmClientFactory } from '../../../common/services/llm-client.factory';
import { extractText } from '../../../common/types/llm.types';
import { BRANCH_SPLIT_SYSTEM_PROMPT, buildBranchSplitPrompt } from './branch-split-prompts';

export interface ChangedFile {
  status: 'A' | 'M' | 'D';
  path: string;
}

export interface HunkPiece {
  patch: string;
  added: number;
  deleted: number;
}

export interface FileDiff {
  file: string;
  status: ChangedFile['status'];
  header: string[];
  hunks: HunkPiece[];
}

export interface DiffAnalysis {
  current: string;
  target: string;
  base: string;
  headSha: string;
  files: ChangedFile[];
  fileDiffs: FileDiff[];
}

export interface BranchSplitGroup {
  name: string;
  responsibility: string;
  commit: string;
  hunks: string[];
  order: number;
  dependsOn?: number;
  linesAdded: number;
  linesDeleted: number;
}

export interface CreatedBranch {
  branch: string;
  dir: string;
  base: string;
  order: number;
  commit: string;
  responsibility: string;
  files: string[];
  hunks: string[];
  linesAdded: number;
  linesDeleted: number;
  title?: string;
  prUrl?: string;
}

export interface BranchSplitManifest {
  version: 2;
  createdAt: string;
  current: string;
  target: string;
  base: string;
  branches: CreatedBranch[];
}

export const TARGET_LINES_MIN = 200;
export const TARGET_LINES_MAX = 300;

@Injectable()
export class BranchSplitService {
  constructor(private readonly llmClientFactory: LlmClientFactory) {}

  private git(cwd: string, args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' });
  }

  private hunkId(file: string, index: number): string {
    return `${file}#${index}`;
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

    const raw = this.git(cwd, ['diff', '--no-color', '--no-renames', `${base}..HEAD`]);
    const fileDiffs = this.parseDiff(raw);
    const files: ChangedFile[] = fileDiffs.map((fd) => ({ status: fd.status, path: fd.file }));

    return { current, target, base, headSha, files, fileDiffs };
  }

  parseDiff(raw: string): FileDiff[] {
    const files: FileDiff[] = [];
    let cur: FileDiff | null = null;
    let hunk: string[] | null = null;

    const flushHunk = (): void => {
      if (cur && hunk) {
        const added = hunk.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
        const deleted = hunk.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
        cur.hunks.push({ patch: hunk.join('\n'), added, deleted });
      }
      hunk = null;
    };

    for (const line of raw.split('\n')) {
      if (line.startsWith('diff --git ')) {
        flushHunk();
        if (cur) files.push(cur);
        const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
        const file = match ? match[2] : line.replace('diff --git ', '');
        cur = { file, status: 'M', header: [line], hunks: [] };
      } else if (line.startsWith('@@')) {
        flushHunk();
        hunk = [line];
      } else if (hunk) {
        hunk.push(line);
      } else if (cur) {
        cur.header.push(line);
        if (line.startsWith('new file')) cur.status = 'A';
        else if (line.startsWith('deleted file')) cur.status = 'D';
      }
    }
    flushHunk();
    if (cur) files.push(cur);
    return files;
  }

  allHunkIds(analysis: DiffAnalysis): string[] {
    const ids: string[] = [];
    for (const fd of analysis.fileDiffs) {
      fd.hunks.forEach((_, i) => ids.push(this.hunkId(fd.file, i)));
    }
    return ids;
  }

  hunkWeights(analysis: DiffAnalysis): Map<string, HunkPiece> {
    const map = new Map<string, HunkPiece>();
    for (const fd of analysis.fileDiffs) {
      fd.hunks.forEach((h, i) => map.set(this.hunkId(fd.file, i), h));
    }
    return map;
  }

  validateGroups(groups: BranchSplitGroup[], allHunks: string[]): string[] {
    const errors: string[] = [];
    const seen = new Map<string, number>();
    for (const group of groups) {
      if (group.hunks.length === 0) errors.push(`group "${group.name}" is empty`);
      for (const id of group.hunks) {
        seen.set(id, (seen.get(id) ?? 0) + 1);
        if (!allHunks.includes(id)) errors.push(`unknown hunk in group "${group.name}": ${id}`);
      }
    }
    for (const id of allHunks) {
      const count = seen.get(id) ?? 0;
      if (count === 0) errors.push(`hunk missing from all groups: ${id}`);
      if (count > 1) errors.push(`hunk in multiple groups: ${id}`);
    }
    return errors;
  }

  private weighGroup(group: BranchSplitGroup, weights: Map<string, HunkPiece>): BranchSplitGroup {
    let added = 0;
    let deleted = 0;
    for (const id of group.hunks) {
      const h = weights.get(id);
      if (h) { added += h.added; deleted += h.deleted; }
    }
    return { ...group, linesAdded: added, linesDeleted: deleted };
  }

  normalizeBudget(groups: BranchSplitGroup[], weights: Map<string, HunkPiece>): BranchSplitGroup[] {
    const weighed = groups.map((g) => this.weighGroup(g, weights));
    const result: BranchSplitGroup[] = [];
    for (const group of weighed) {
      const prev = result[result.length - 1];
      const size = group.linesAdded + group.linesDeleted;
      const prevSize = prev ? prev.linesAdded + prev.linesDeleted : 0;
      if (prev && prevSize < TARGET_LINES_MIN && prevSize + size <= TARGET_LINES_MAX) {
        prev.hunks.push(...group.hunks);
        prev.responsibility = `${prev.responsibility}; ${group.responsibility}`;
        prev.linesAdded += group.linesAdded;
        prev.linesDeleted += group.linesDeleted;
      } else {
        result.push({ ...group, hunks: [...group.hunks] });
      }
    }
    return result.map((g, i) => ({ ...g, order: i + 1, dependsOn: i === 0 ? undefined : i }));
  }

  async groupHunks(analysis: DiffAnalysis, cwd: string = process.cwd()): Promise<BranchSplitGroup[]> {
    const weights = this.hunkWeights(analysis);
    const allIds = this.allHunkIds(analysis);
    const llm = this.llmClientFactory.create('cheap');

    let lastErrors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const retryNote = lastErrors.length > 0
        ? `\n\nYour previous answer had these errors, fix them:\n${lastErrors.join('\n')}`
        : '';
      const response = await llm.invoke([
        { role: 'system', content: BRANCH_SPLIT_SYSTEM_PROMPT },
        { role: 'user', content: buildBranchSplitPrompt(analysis.fileDiffs) + retryNote },
      ]);
      const groups = this.parseGroups(extractText(response));
      if (!groups) { lastErrors = ['response was not a valid JSON array of groups']; continue; }
      lastErrors = this.validateGroups(groups, allIds);
      if (lastErrors.length === 0) return this.normalizeBudget(groups, weights);
    }
    throw new Error(`Could not produce a valid hunk grouping:\n${lastErrors.join('\n')}`);
  }

  private parseGroups(content: string): BranchSplitGroup[] | null {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) return null;
      return parsed.map((g, i) => ({
        name: String(g.name ?? 'group').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'group',
        responsibility: String(g.responsibility ?? ''),
        commit: String(g.commit ?? 'chore: split changes'),
        hunks: Array.isArray(g.hunks) ? g.hunks.map(String) : [],
        order: i + 1,
        dependsOn: i === 0 ? undefined : i,
        linesAdded: 0,
        linesDeleted: 0,
      }));
    } catch {
      return null;
    }
  }

  splitBranchName(current: string, index: number, slug: string): string {
    return `${current}--split/${index}-${slug}`;
  }

  branchDirName(branch: string): string {
    return branch.replace(/\//g, '__');
  }

  private buildPatch(fd: FileDiff, indices: number[]): string {
    const sorted = [...indices].sort((a, b) => a - b);
    return [...fd.header, ...sorted.map((i) => fd.hunks[i].patch)].join('\n') + '\n';
  }

  createStackedBranches(
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

    const fdByFile = new Map(analysis.fileDiffs.map((fd) => [fd.file, fd]));
    const acc = new Map<string, number[]>();
    const created: CreatedBranch[] = [];
    let parent = analysis.target;

    groups.forEach((group, i) => {
      const branch = this.splitBranchName(analysis.current, i + 1, group.name);
      this.git(cwd, ['branch', branch, parent]);

      const filesInSlice = new Set<string>();
      let added = 0;
      let deleted = 0;
      for (const id of group.hunks) {
        const hash = id.lastIndexOf('#');
        const file = id.slice(0, hash);
        const index = Number(id.slice(hash + 1));
        filesInSlice.add(file);
        const list = acc.get(file) ?? [];
        list.push(index);
        acc.set(file, list);
        const piece = fdByFile.get(file)?.hunks[index];
        if (piece) { added += piece.added; deleted += piece.deleted; }
      }

      const worktreeParent = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-split-wt-'));
      const worktree = path.join(worktreeParent, 'wt');
      try {
        this.git(cwd, ['worktree', 'add', '--quiet', worktree, branch]);
        for (const file of filesInSlice) {
          const fd = fdByFile.get(file);
          if (!fd) continue;
          if (fd.status === 'A') {
            try { fs.rmSync(path.join(worktree, file), { force: true }); } catch { /* absent */ }
          } else {
            this.git(worktree, ['checkout', analysis.base, '--', file]);
          }
          const patchPath = path.join(worktreeParent, 'slice.patch');
          fs.writeFileSync(patchPath, this.buildPatch(fd, acc.get(file)!));
          try {
            this.git(worktree, ['apply', '--whitespace=nowarn', patchPath]);
          } catch (error) {
            throw new Error(`Failed to apply hunks for ${file} on ${branch}: ${error instanceof Error ? error.message : String(error)}`);
          }
          this.git(worktree, ['add', '-A', '--', file]);
        }
        this.git(worktree, ['commit', '-q', '-m', group.commit]);
      } finally {
        try { this.git(cwd, ['worktree', 'remove', '--force', worktree]); } catch { /* best-effort */ }
        fs.rmSync(worktreeParent, { recursive: true, force: true });
      }

      created.push({
        branch,
        dir: this.branchDirName(branch),
        base: parent,
        order: i + 1,
        commit: group.commit,
        responsibility: group.responsibility,
        files: [...filesInSlice],
        hunks: group.hunks,
        linesAdded: added,
        linesDeleted: deleted,
      });

      parent = branch;
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
      const dependsOn = i > 0 ? branches[i - 1].branch : analysis.target;
      const requiredBy = i < branches.length - 1 ? branches[i + 1].branch : null;
      fs.writeFileSync(path.join(branchDir, 'PR.md'), [
        `# ${entry.title}`,
        '',
        `> PR ${i + 1}/${branches.length}: \`${entry.branch}\` → \`${entry.base}\``,
        `> +${entry.linesAdded} −${entry.linesDeleted} lines`,
        '',
        `**Depends on:** \`${dependsOn}\``,
        requiredBy ? `**Required by:** \`${requiredBy}\`` : '**Required by:** _(top of stack)_',
        '',
        prDescriptions[i]?.description ?? entry.responsibility,
        '',
        '## Files in this slice',
        '',
        ...entry.files.map((f) => `- \`${f}\``),
        '',
        '## How to open this PR',
        '',
        '```bash',
        `git push -u origin "${entry.base}"`,
        `git push -u origin "${entry.branch}"`,
        `gh pr create --base "${entry.base}" --head "${entry.branch}" --title "${entry.title.replace(/"/g, '\\"')}" --body-file ".branches/${entry.dir}/PR.md"`,
        '```',
        '',
        `Or run \`cast branch-split-create\` to push and open every PR automatically.`,
        '',
      ].join('\n'));
    });

    const manifest: BranchSplitManifest = {
      version: 2,
      createdAt: new Date().toISOString(),
      current: analysis.current,
      target: analysis.target,
      base: analysis.base,
      branches,
    };
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));

    fs.writeFileSync(path.join(root, 'README.md'), [
      `# Stacked split of \`${analysis.current}\``,
      '',
      `Target: \`${analysis.target}\` · base: \`${analysis.base.slice(0, 8)}\` · created ${manifest.createdAt}`,
      '',
      'Each PR below is one reviewable slice stacked on the previous one. Review and merge',
      `top-down: \`${analysis.target}\` ← PR1 ← PR2 ← … Each PR shows only its own diff.`,
      '',
      '| # | Branch | Base | Responsibility | +/− | Files | PR doc |',
      '|---|--------|------|----------------|-----|-------|--------|',
      ...branches.map((b, i) =>
        `| ${i + 1} | \`${b.branch}\` | \`${b.base}\` | ${b.responsibility} | +${b.linesAdded} −${b.linesDeleted} | ${b.files.length} | [PR.md](./${b.dir}/PR.md) |`),
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

    run('git', ['push', '-u', 'origin', manifest.target]);

    const created: CreatedBranch[] = [];
    const failed: Array<{ branch: string; error: string }> = [];

    for (const entry of manifest.branches) {
      try {
        if (entry.prUrl) { created.push(entry); continue; }
        const existing = run('gh', ['pr', 'list', '--head', entry.branch, '--json', 'url']).trim();
        if (existing && existing !== '[]') {
          entry.prUrl = (JSON.parse(existing)[0]?.url as string) ?? entry.prUrl;
          created.push(entry);
          continue;
        }
        run('git', ['push', '-u', 'origin', entry.branch]);
        const url = run('gh', [
          'pr', 'create',
          '--base', entry.base,
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
