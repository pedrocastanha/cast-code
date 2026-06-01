import { Injectable } from '@nestjs/common';
import type { SandboxBackend, SandboxContext, SandboxRunOptions } from '../types';

@Injectable()
export class NoopSandboxService implements SandboxBackend {
  readonly mode = 'none' as const;

  async prepare(options: SandboxRunOptions): Promise<SandboxContext> {
    return {
      mode: 'none',
      requestedMode: options.requestedMode ?? options.config?.mode ?? 'none',
      runId: options.runId,
      projectRoot: options.projectRoot,
      root: options.projectRoot,
      artifactDir: options.artifactDir,
      commandLog: options.fallbackReason ? [options.fallbackReason] : [],
    };
  }

  async capture(): Promise<Record<string, never>> {
    return {};
  }

  async dispose(): Promise<void> {
    return undefined;
  }
}
