import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { StateRedactionService } from '../../state/services/state-redaction.service';
import { SandboxArtifactService } from './sandbox-artifact.service';
import { SandboxManagerService } from './sandbox-manager.service';
import type { SandboxBackend, SandboxContext, SandboxRunOptions } from '../types';

class FakeBackend implements SandboxBackend {
  readonly mode = 'snapshot' as const;
  disposed = false;
  rolledBack = false;

  async prepare(options: SandboxRunOptions): Promise<SandboxContext> {
    return {
      mode: 'snapshot',
      requestedMode: options.config?.mode ?? 'snapshot',
      runId: options.runId,
      projectRoot: options.projectRoot,
      root: options.projectRoot,
      artifactDir: options.artifactDir,
      checkpointId: options.runId,
      commandLog: ['prepared snapshot'],
    };
  }

  async capture(): Promise<{ diff: string; status: string; snapshot: Record<string, unknown> }> {
    return {
      diff: 'CAST_API_KEY=secret-value\n+changed line\n',
      status: ' M src/app.ts',
      snapshot: { files: 1 },
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  async rollback(): Promise<boolean> {
    this.rolledBack = true;
    return true;
  }
}

describe('SandboxManagerService', () => {
  test('passes sandbox context, writes redacted artifacts, and preserves cwd', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cast-sandbox-manager-'));
    const previousCwd = process.cwd();
    const backend = new FakeBackend();
    const manager = new SandboxManagerService(
      {} as any,
      backend as any,
      {} as any,
      {} as any,
      new SandboxArtifactService(new StateRedactionService()),
    );

    try {
      const artifactDir = join(root, '.cast', 'benchmarks', 'run-1');
      await mkdir(artifactDir, { recursive: true });

      const result = await manager.run(
        {
          runId: 'run-1',
          projectRoot: root,
          artifactDir,
          config: { mode: 'snapshot', rollbackOnFailure: true },
        },
        async (context) => {
          assert.equal(context.root, root);
          assert.equal(process.cwd(), previousCwd);
          return { status: 'failed' as const };
        },
      );

      assert.equal(process.cwd(), previousCwd);
      assert.equal(result.context.checkpointId, 'run-1');
      assert.equal(result.artifacts.some((artifact) => artifact.kind === 'sandbox-diff'), true);
      assert.equal(await readFile(join(artifactDir, 'sandbox-diff.patch'), 'utf-8'), 'CAST_API_KEY=[REDACTED_SECRET]\n+changed line\n');
      assert.equal(backend.rolledBack, true);
      assert.equal(backend.disposed, true);
    } finally {
      process.chdir(previousCwd);
      await rm(root, { recursive: true, force: true });
    }
  });

  test('falls back from Docker to snapshot when Docker is unavailable', async () => {
    const backend = new FakeBackend();
    const manager = new SandboxManagerService(
      {} as any,
      backend as any,
      {} as any,
      { isAvailable: async () => false } as any,
      new SandboxArtifactService(new StateRedactionService()),
    );

    const selected = await manager.selectBackend({
      runId: 'run-1',
      projectRoot: '/project',
      config: { mode: 'docker' },
    });
    const context = await selected.prepare({
      runId: 'run-1',
      projectRoot: '/project',
      config: { mode: 'docker' },
    });

    assert.equal(context.mode, 'snapshot');
    assert.equal(context.requestedMode, 'docker');
    assert.match(context.fallbackReason ?? '', /Docker is not available/);
    assert.match(context.commandLog.join('\n'), /using snapshot sandbox/);
  });

  test('falls back from Docker to snapshot while operations still execute in-process', async () => {
    const backend = new FakeBackend();
    const manager = new SandboxManagerService(
      {} as any,
      backend as any,
      {} as any,
      { isAvailable: async () => true } as any,
      new SandboxArtifactService(new StateRedactionService()),
    );

    const selected = await manager.selectBackend({
      runId: 'run-1',
      projectRoot: '/project',
      config: { mode: 'docker' },
    });
    const context = await selected.prepare({
      runId: 'run-1',
      projectRoot: '/project',
      config: { mode: 'docker' },
    });

    assert.equal(context.mode, 'snapshot');
    assert.equal(context.requestedMode, 'docker');
    assert.match(context.fallbackReason ?? '', /cannot be containerized yet/);
  });

  test('rolls back completed benchmark runs with non-passing cases when rollbackOnFailure is enabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cast-sandbox-manager-failed-cases-'));
    const backend = new FakeBackend();
    const manager = new SandboxManagerService(
      {} as any,
      backend as any,
      {} as any,
      {} as any,
      new SandboxArtifactService(new StateRedactionService()),
    );

    try {
      await manager.run(
        {
          runId: 'run-1',
          projectRoot: root,
          artifactDir: join(root, '.cast', 'benchmarks', 'run-1'),
          config: { mode: 'snapshot', rollbackOnFailure: true },
        },
        async () => ({ status: 'completed' as const, summary: { failedCases: 1, passRate: 0 } }),
      );

      assert.equal(backend.rolledBack, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
