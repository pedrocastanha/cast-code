import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SandboxBackend, SandboxContext, SandboxRunOptions } from '../types';
import { SandboxCommandRunnerService } from './sandbox-command-runner.service';

@Injectable()
export class GitWorktreeSandboxService implements SandboxBackend {
  readonly mode = 'git-worktree' as const;

  constructor(private readonly commands: SandboxCommandRunnerService) {}

  async prepare(options: SandboxRunOptions): Promise<SandboxContext> {
    const gitRoot = await this.gitRoot(options.projectRoot);
    if (!gitRoot) {
      throw new Error('Git worktree sandbox requires a git repository.');
    }

    const baseDir = path.resolve(options.projectRoot, '.cast', 'worktrees');
    const worktreePath = path.resolve(baseDir, this.safeName(options.runId));
    if (!this.isInside(worktreePath, baseDir)) {
      throw new Error('Refusing to create a worktree outside .cast/worktrees.');
    }

    await fs.mkdir(baseDir, { recursive: true });
    const add = await this.commands.run('git', ['-C', gitRoot, 'worktree', 'add', '--detach', worktreePath, 'HEAD']);
    if (add.exitCode !== 0) {
      throw new Error(`Failed to create git worktree sandbox: ${add.stderr || add.stdout}`);
    }

    return {
      mode: 'git-worktree',
      requestedMode: options.requestedMode ?? options.config?.mode ?? 'git-worktree',
      runId: options.runId,
      projectRoot: options.projectRoot,
      root: worktreePath,
      artifactDir: options.artifactDir,
      worktreePath,
      commandLog: [
        ...(options.fallbackReason ? [options.fallbackReason] : []),
        `git worktree add --detach ${this.relative(options.projectRoot, worktreePath)} HEAD`,
      ],
    };
  }

  async capture(context: SandboxContext): Promise<{ diff?: string; status?: string }> {
    if (!context.worktreePath) {
      return {};
    }
    const diff = await this.commands.run('git', ['-C', context.worktreePath, 'diff', '--no-ext-diff', '--']);
    const status = await this.commands.run('git', ['-C', context.worktreePath, 'status', '--short']);
    return {
      diff: diff.exitCode === 0 ? diff.stdout : '',
      status: status.exitCode === 0 ? status.stdout : '',
    };
  }

  async dispose(context: SandboxContext): Promise<void> {
    if (!context.worktreePath) {
      return;
    }
    const baseDir = path.resolve(context.projectRoot, '.cast', 'worktrees');
    if (!this.isInside(context.worktreePath, baseDir) || path.resolve(context.worktreePath) === path.resolve(context.projectRoot)) {
      throw new Error('Refusing to remove unsafe worktree path.');
    }
    await this.commands.run('git', ['-C', context.projectRoot, 'worktree', 'remove', '--force', context.worktreePath]);
  }

  private async gitRoot(projectRoot: string): Promise<string | null> {
    const result = await this.commands.run('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel']);
    if (result.exitCode !== 0) {
      return null;
    }
    return result.stdout.trim();
  }

  private safeName(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]/g, '-');
  }

  private isInside(candidate: string, parent: string): boolean {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  private relative(projectRoot: string, value: string): string {
    const relative = path.relative(projectRoot, value);
    return relative && !relative.startsWith('..') ? relative : value;
  }
}
