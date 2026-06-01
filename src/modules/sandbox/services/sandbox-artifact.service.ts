import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { StateRedactionService } from '../../state/services/state-redaction.service';
import type { SandboxArtifact, SandboxContext } from '../types';

@Injectable()
export class SandboxArtifactService {
  constructor(private readonly redaction: StateRedactionService) {}

  async writeArtifacts(
    context: SandboxContext,
    capture: { diff?: string; status?: string; snapshot?: Record<string, unknown> },
  ): Promise<SandboxArtifact[]> {
    if (!context.artifactDir) {
      return [];
    }

    await fs.mkdir(context.artifactDir, { recursive: true, mode: 0o700 });
    const artifacts: SandboxArtifact[] = [];
    const summary = {
      runId: context.runId,
      mode: context.mode,
      requestedMode: context.requestedMode,
      root: this.relative(context.projectRoot, context.root),
      fallbackReason: context.fallbackReason,
      status: capture.status,
      checkpointId: context.checkpointId,
      worktreePath: context.worktreePath ? this.relative(context.projectRoot, context.worktreePath) : undefined,
    };

    artifacts.push(await this.writeJson(context.artifactDir, 'sandbox-summary.json', summary, 'sandbox-summary'));

    if (capture.diff?.trim()) {
      artifacts.push(await this.writeText(context.artifactDir, 'sandbox-diff.patch', capture.diff, 'sandbox-diff'));
    }
    if (context.commandLog.length > 0) {
      artifacts.push(await this.writeText(context.artifactDir, 'sandbox-command.log', context.commandLog.join('\n') + '\n', 'sandbox-command-log'));
    }
    if (capture.snapshot) {
      artifacts.push(await this.writeJson(context.artifactDir, 'sandbox-snapshot.json', capture.snapshot, 'sandbox-snapshot'));
    }
    if (context.worktreePath) {
      artifacts.push(await this.writeText(
        context.artifactDir,
        'sandbox-worktree.txt',
        `${this.relative(context.projectRoot, context.worktreePath)}\n`,
        'sandbox-worktree',
      ));
    }

    return artifacts;
  }

  private async writeJson(
    artifactDir: string,
    name: string,
    value: unknown,
    kind: SandboxArtifact['kind'],
  ): Promise<SandboxArtifact> {
    return this.writeText(artifactDir, name, JSON.stringify(value, null, 2) + '\n', kind);
  }

  private async writeText(
    artifactDir: string,
    name: string,
    value: string,
    kind: SandboxArtifact['kind'],
  ): Promise<SandboxArtifact> {
    const filePath = path.join(artifactDir, name);
    await fs.writeFile(filePath, this.redaction.redact(value), { encoding: 'utf-8', mode: 0o600 });
    return { kind, name, path: filePath };
  }

  private relative(projectRoot: string, value: string): string {
    const relative = path.relative(projectRoot, value);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative || '.';
    }
    return value;
  }
}
