import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ProjectLoaderService } from './project-loader.service';

describe('ProjectLoaderService workspace root detection', () => {
  test('keeps the nearest Cast project while exposing the parent Cast workspace', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'cast-workspace-root-'));
    const project = path.join(workspace, 'cast-code');
    try {
      await mkdir(path.join(workspace, '.cast'), { recursive: true });
      await mkdir(path.join(project, '.cast'), { recursive: true });
      await mkdir(path.join(workspace, 'web'), { recursive: true });

      const loader = new ProjectLoaderService({
        exists: async (target: string) => {
          try {
            await import('node:fs/promises').then((fs) => fs.access(target));
            return true;
          } catch {
            return false;
          }
        },
      } as any);

      assert.equal(await loader.detectProject(project), project);
      assert.equal(await loader.detectWorkspaceRoot(project), workspace);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test('uses the project itself when no parent Cast workspace exists', async () => {
    const project = await mkdtemp(path.join(tmpdir(), 'cast-project-root-'));
    try {
      await mkdir(path.join(project, '.cast'), { recursive: true });
      const loader = new ProjectLoaderService({
        exists: async (target: string) => {
          try {
            await import('node:fs/promises').then((fs) => fs.access(target));
            return true;
          } catch {
            return false;
          }
        },
      } as any);

      assert.equal(await loader.detectWorkspaceRoot(project), project);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
