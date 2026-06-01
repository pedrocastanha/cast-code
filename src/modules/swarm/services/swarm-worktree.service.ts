import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SandboxCommandRunnerService } from '../../sandbox/services/sandbox-command-runner.service';
import type { SwarmWorktreeContext } from '../types';

@Injectable()
export class SwarmWorktreeService {
  constructor(private readonly commands: SandboxCommandRunnerService) {}

  async create(input: {
    runId: string;
    taskId: string;
    projectRoot: string;
    workspaceRoot: string;
  }): Promise<SwarmWorktreeContext> {
    const gitRoot = await this.gitRoot(input.projectRoot);
    if (!gitRoot) {
      throw new Error('Agent Swarm requires a git repository for worktree isolation.');
    }

    const baseDir = path.resolve(input.projectRoot, '.cast', 'worktrees', this.safeName(input.runId));
    const worktreePath = path.resolve(baseDir, this.safeName(input.taskId));
    const branchName = `cast/swarm/${this.safeName(input.runId)}/${this.safeName(input.taskId)}`;

    if (!this.isInside(worktreePath, baseDir)) {
      throw new Error('Refusing to create a worktree outside .cast/worktrees.');
    }

    await fs.mkdir(baseDir, { recursive: true });
    await this.commands.run('git', ['-C', gitRoot, 'branch', '-f', branchName, 'HEAD']).catch(() => undefined);
    const add = await this.commands.run('git', [
      '-C', gitRoot,
      'worktree', 'add',
      '-B', branchName,
      worktreePath,
      'HEAD',
    ]);

    if (add.exitCode !== 0) {
      throw new Error(`Failed to create swarm worktree: ${add.stderr || add.stdout}`);
    }

    return {
      runId: input.runId,
      taskId: input.taskId,
      branchName,
      worktreePath,
      projectRoot: input.projectRoot,
      workspaceRoot: input.workspaceRoot,
    };
  }

  async captureDiff(worktreePath: string): Promise<{ diff: string; status: string; changedFiles: string[]; untrackedFiles: string[] }> {
    const diff = await this.commands.run('git', ['-C', worktreePath, 'diff', '--no-ext-diff', '--']);
    const status = await this.commands.run('git', ['-C', worktreePath, 'status', '--short']);
    const names = await this.commands.run('git', ['-C', worktreePath, 'diff', '--name-only', '--']);
    const tracked = names.exitCode === 0
      ? names.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
      : [];
    const untracked = status.exitCode === 0
      ? status.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('??'))
        .map((line) => line.slice(3).trim())
        .filter(Boolean)
      : [];
    const changedFiles = [...new Set([...tracked, ...untracked])];

    return {
      diff: diff.exitCode === 0 ? diff.stdout : '',
      status: status.exitCode === 0 ? status.stdout : '',
      changedFiles,
      untrackedFiles: untracked,
    };
  }

  async dispose(context: SwarmWorktreeContext, options: { removeBranch?: boolean } = {}): Promise<void> {
    const baseDir = path.resolve(context.projectRoot, '.cast', 'worktrees', this.safeName(context.runId));
    if (!this.isInside(context.worktreePath, baseDir)) {
      throw new Error('Refusing to remove unsafe swarm worktree path.');
    }

    await this.commands.run('git', ['-C', context.projectRoot, 'worktree', 'remove', '--force', context.worktreePath]);
    if (options.removeBranch) {
      await this.commands.run('git', ['-C', context.projectRoot, 'branch', '-D', context.branchName]).catch(() => undefined);
    }
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
}
