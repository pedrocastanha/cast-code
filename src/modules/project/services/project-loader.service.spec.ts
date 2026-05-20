import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ProjectLoaderService } from './project-loader.service';

function createScopedLoader(root: string): ProjectLoaderService {
  const scopedRoot = path.resolve(root);

  return new ProjectLoaderService({
    exists: async (target: string) => {
      const resolved = path.resolve(target);
      if (resolved !== scopedRoot && !resolved.startsWith(`${scopedRoot}${path.sep}`)) {
        return false;
      }

      try {
        await access(resolved);
        return true;
      } catch {
        return false;
      }
    },
  } as any);
}

describe('ProjectLoaderService workspace root detection', () => {
  test('keeps the nearest Cast project while exposing the parent Cast workspace', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'cast-workspace-root-'));
    const project = path.join(workspace, 'cast-code');
    try {
      await mkdir(path.join(workspace, '.cast'), { recursive: true });
      await mkdir(path.join(project, '.cast'), { recursive: true });
      await mkdir(path.join(workspace, 'web'), { recursive: true });

      const loader = createScopedLoader(workspace);

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
      const loader = createScopedLoader(project);

      assert.equal(await loader.detectWorkspaceRoot(project), project);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
