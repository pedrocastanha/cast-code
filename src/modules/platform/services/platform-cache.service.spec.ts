import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { PlatformCacheService } from './platform-cache.service';
import { PlatformProjectPayload } from '../types';

const makeProject = async () => mkdtemp(path.join(tmpdir(), 'cast-platform-cache-'));

const payload = (fetchedAt: string): PlatformProjectPayload => ({
  fetchedAt,
  project: { id: 'project-1', name: 'Project' },
  features: { remoteAgents: true, benchAccess: false, maxSkills: 5 },
  skills: [],
  agents: [],
});

describe('PlatformCacheService', () => {
  test('writes and reads usable project cache', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformCacheService();
      await service.writeProjectCache(projectRoot, payload(new Date().toISOString()));

      const cached = await service.readProjectCache(projectRoot);

      assert.equal(cached?.project.id, 'project-1');
      assert.equal(service.isProjectCacheUsable(cached), true);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('stale cache older than max age is not usable', () => {
    const service = new PlatformCacheService();
    const old = payload(new Date(Date.now() - 90_000_000).toISOString());

    assert.equal(service.isProjectCacheUsable(old, 86_400_000), false);
  });

  test('recent cache with incompatible shape is not usable', () => {
    const service = new PlatformCacheService();

    assert.equal(
      service.isProjectCacheUsable({
        fetchedAt: new Date().toISOString(),
        project: { id: 'project-1', name: 'Project' },
      } as any),
      false,
    );
  });

  test('malformed cache returns null', async () => {
    const projectRoot = await makeProject();
    try {
      await mkdir(path.join(projectRoot, '.cast'), { recursive: true });
      await writeFile(path.join(projectRoot, '.cast', 'platform.cache.json'), '{');
      const service = new PlatformCacheService();

      assert.equal(await service.readProjectCache(projectRoot), null);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('appends and clears pending events', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformCacheService();
      await service.appendPendingEvents(projectRoot, [
        { type: 'command.run', payload: { command: '/help' }, ts: '2026-04-29T12:00:00.000Z' },
      ]);
      await service.appendPendingEvents(projectRoot, [
        { type: 'tokens.consumed', payload: { input: 1, output: 2, model: 'm', cost: 0 }, ts: '2026-04-29T12:00:01.000Z' },
      ]);

      const events = await service.readPendingEvents(projectRoot);
      assert.equal(events.length, 2);

      await service.clearPendingEvents(projectRoot);
      assert.deepEqual(await service.readPendingEvents(projectRoot), []);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
