import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { BenchmarkExplicitTargetService } from './benchmark-explicit-target.service';
import { BenchmarkRouteDiscoveryService } from './benchmark-route-discovery.service';

test('explicit target resolution scans only the mentioned file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cast-explicit-target-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src/chat.ts'), `router.post('/chat', (req, res) => res.json({ answer: req.body.message }))`);
  await writeFile(join(root, 'src/other.ts'), `router.post('/ignored', handler)`);

  let projectDiscoveryCalls = 0;
  const discovery = new BenchmarkRouteDiscoveryService();
  const original = discovery.discoverProject.bind(discovery);
  discovery.discoverProject = async (...args) => {
    projectDiscoveryCalls += 1;
    return original(...args);
  };

  const service = new BenchmarkExplicitTargetService(discovery);
  const result = await service.resolve(['@src/chat.ts', 'POST', '/chat', '--base-url', 'http://localhost:3000'], root);

  assert.equal(projectDiscoveryCalls, 0);
  assert.equal(result?.mentionedPath, join(root, 'src/chat.ts'));
  assert.equal(result?.candidates.length, 1);
  assert.equal(result?.candidates[0].routePath, '/chat');
});

test('explicit target parser returns null when no mention is present', async () => {
  const service = new BenchmarkExplicitTargetService(new BenchmarkRouteDiscoveryService());
  const result = await service.resolve(['discover'], process.cwd());
  assert.equal(result, null);
});
