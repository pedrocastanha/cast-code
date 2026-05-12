import { Injectable } from '@nestjs/common';
import type { SandboxBackend, SandboxContext, SandboxRunOptions } from '../types';
import { SnapshotService } from '../../snapshots/services/snapshot.service';
import { SandboxCommandRunnerService } from './sandbox-command-runner.service';

@Injectable()
export class SnapshotSandboxService implements SandboxBackend {
  readonly mode = 'snapshot' as const;

  constructor(
    private readonly snapshots: SnapshotService,
    private readonly commands: SandboxCommandRunnerService,
  ) {}

  async prepare(options: SandboxRunOptions): Promise<SandboxContext> {
    const checkpoint = this.snapshots.saveCheckpoint(options.projectRoot, options.runId);
    return {
      mode: 'snapshot',
      requestedMode: options.requestedMode ?? options.config?.mode ?? 'snapshot',
      runId: options.runId,
      projectRoot: options.projectRoot,
      root: options.projectRoot,
      artifactDir: options.artifactDir,
      checkpointId: options.runId,
      commandLog: [
        ...(options.fallbackReason ? [options.fallbackReason] : []),
        `snapshot checkpoint ${options.runId}: ${checkpoint.files.length} files`,
      ],
    };
  }

  async capture(context: SandboxContext): Promise<{
    diff?: string;
    status?: string;
    snapshot?: Record<string, unknown>;
  }> {
    const diff = await this.git(context.root, ['diff', '--no-ext-diff', '--']);
    const status = await this.git(context.root, ['status', '--short']);
    return {
      diff,
      status,
      snapshot: {
        checkpointId: context.checkpointId,
        files: this.snapshots.listCheckpoints().find((checkpoint) => checkpoint.checkpointId === context.checkpointId)?.files.length ?? 0,
      },
    };
  }

  async dispose(): Promise<void> {
    return undefined;
  }

  async rollback(runId: string, _projectRoot?: string): Promise<boolean> {
    return this.snapshots.rollbackCheckpoint(runId);
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const result = await this.commands.run('git', args, { cwd });
    if (result.exitCode !== 0) {
      return '';
    }
    return result.stdout.trim();
  }
}
