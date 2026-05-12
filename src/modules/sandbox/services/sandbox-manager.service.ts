import { Injectable } from '@nestjs/common';
import * as path from 'node:path';
import type {
  SandboxBackend,
  SandboxContext,
  SandboxMode,
  SandboxRunOptions,
  SandboxRunResult,
} from '../types';
import { DockerSandboxService } from './docker-sandbox.service';
import { GitWorktreeSandboxService } from './git-worktree-sandbox.service';
import { NoopSandboxService } from './noop-sandbox.service';
import { SandboxArtifactService } from './sandbox-artifact.service';
import { SnapshotSandboxService } from './snapshot-sandbox.service';

@Injectable()
export class SandboxManagerService {
  constructor(
    private readonly noop: NoopSandboxService,
    private readonly snapshot: SnapshotSandboxService,
    private readonly worktree: GitWorktreeSandboxService,
    private readonly docker: DockerSandboxService,
    private readonly artifacts: SandboxArtifactService,
  ) {}

  async run<T>(options: SandboxRunOptions, operation: (context: SandboxContext) => Promise<T>): Promise<SandboxRunResult<T>> {
    const backend = await this.selectBackend(options);
    let context = await backend.prepare(this.normalizeOptions(options));
    let value: T;
    let operationError: unknown;

    try {
      value = await operation(context);
      if (options.config?.rollbackOnFailure && this.isFailedValue(value) && backend.rollback) {
        const restored = await backend.rollback(options.runId, options.projectRoot);
        context.commandLog.push(`rollback ${restored ? 'restored' : 'not-restored'} checkpoint ${options.runId}`);
      }
    } catch (error) {
      operationError = error;
      if (options.config?.rollbackOnFailure && backend.rollback) {
        const restored = await backend.rollback(options.runId, options.projectRoot);
        context.commandLog.push(`rollback ${restored ? 'restored' : 'not-restored'} checkpoint ${options.runId}`);
      }
    }

    let artifacts: SandboxRunResult<T>['artifacts'] = [];
    let captureError: unknown;
    let disposeError: unknown;
    try {
      const capture = await backend.capture(context);
      context = { ...context, ...capture };
      artifacts = await this.artifacts.writeArtifacts(context, capture);
    } catch (error) {
      captureError = error;
    } finally {
      try {
        await backend.dispose(context);
      } catch (error) {
        disposeError = error;
      }
    }

    if (operationError) {
      throw operationError;
    }
    if (captureError) {
      throw captureError;
    }
    if (disposeError) {
      throw disposeError;
    }

    return {
      value: value!,
      context,
      artifacts,
    };
  }

  async rollback(runId: string, projectRoot: string = process.cwd()): Promise<boolean> {
    return this.snapshot.rollback(runId, projectRoot);
  }

  async selectBackend(options: SandboxRunOptions): Promise<SandboxBackend> {
    const requested = options.config?.mode ?? 'snapshot';
    if (requested === 'none') {
      return this.noop;
    }
    if (requested === 'snapshot') {
      return this.snapshot;
    }
    if (requested === 'git-worktree') {
      return this.worktree;
    }
    if (requested === 'docker') {
      if (!await this.docker.isAvailable()) {
        return new FallbackSandboxBackend(
          this.snapshot,
          'Docker is not available; using snapshot sandbox instead.',
        );
      }
      return new FallbackSandboxBackend(
        this.snapshot,
        'Docker command sandbox is available, but in-process benchmark execution cannot be containerized yet; using snapshot sandbox instead.',
      );
    }
    return this.snapshot;
  }

  private normalizeOptions(options: SandboxRunOptions): SandboxRunOptions {
    return {
      ...options,
      projectRoot: path.resolve(options.projectRoot),
      artifactDir: options.artifactDir ? path.resolve(options.artifactDir) : undefined,
      requestedMode: options.requestedMode,
      fallbackReason: options.fallbackReason,
    };
  }

  private isFailedValue(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as { status?: string; summary?: { failedCases?: number; passRate?: number } };
    if (candidate.status === 'failed' || candidate.status === 'timeout') {
      return true;
    }
    if (candidate.status === 'completed' && candidate.summary) {
      return Number(candidate.summary.failedCases ?? 0) > 0 || Number(candidate.summary.passRate ?? 1) < 1;
    }
    return false;
  }
}

class FallbackSandboxBackend implements SandboxBackend {
  readonly mode: SandboxMode;

  constructor(
    private readonly inner: SandboxBackend,
    private readonly reason: string,
  ) {
    this.mode = inner.mode;
  }

  async prepare(options: SandboxRunOptions): Promise<SandboxContext> {
    const context = await this.inner.prepare(options);
    return {
      ...context,
      requestedMode: options.requestedMode ?? options.config?.mode ?? context.requestedMode,
      fallbackReason: this.reason,
      commandLog: [...context.commandLog, this.reason],
    };
  }

  capture(context: SandboxContext): ReturnType<SandboxBackend['capture']> {
    return this.inner.capture(context);
  }

  dispose(context: SandboxContext): ReturnType<SandboxBackend['dispose']> {
    return this.inner.dispose(context);
  }

  rollback(runId: string, projectRoot?: string): Promise<boolean> {
    return this.inner.rollback?.(runId, projectRoot) ?? Promise.resolve(false);
  }
}
