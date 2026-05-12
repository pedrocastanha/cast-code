import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { BenchmarkStoreService } from '../../benchmark/services/benchmark-store.service';
import { PlatformConfigService } from '../../platform/services/platform-config.service';
import { StateDbService } from '../../state/services/state-db.service';
import { EnvironmentActivationService } from './environment-activation.service';
import { EnvironmentLoaderService } from './environment-loader.service';

const withActivation = async (
  run: (services: {
    activation: EnvironmentActivationService;
    loader: EnvironmentLoaderService;
    platformConfig: PlatformConfigService;
    benchmarkStore: BenchmarkStoreService;
    db: StateDbService;
    projectRoot: string;
  }) => Promise<void>,
) => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-env-activation-'));
  const previousStateDbPath = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(projectRoot, 'state.db');
  const db = new StateDbService();
  const platformConfig = new PlatformConfigService();
  const benchmarkStore = new BenchmarkStoreService(db);
  const activation = new EnvironmentActivationService(db, platformConfig, benchmarkStore);
  const loader = new EnvironmentLoaderService();

  try {
    await run({ activation, loader, platformConfig, benchmarkStore, db, projectRoot });
  } finally {
    await db.close();
    if (previousStateDbPath === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousStateDbPath;
    }
    await rm(projectRoot, { recursive: true, force: true });
  }
};

describe('EnvironmentActivationService', () => {
  test('persists activation to cast manifest, local state, and seeds smoke benchmarks', async () => {
    await withActivation(async ({ activation, loader, platformConfig, benchmarkStore, db, projectRoot }) => {
      const marketing = await loader.get('marketing', projectRoot);
      assert(marketing);

      const result = await activation.activate(projectRoot, marketing);

      assert.equal(result.environmentId, 'marketing');
      assert.equal(await platformConfig.getProjectEnvironment(projectRoot), 'marketing');

      const row = db.getDbSync().prepare('select * from environment_activations where project_root = ?').get(projectRoot) as any;
      assert.equal(row.environment_id, 'marketing');
      assert.equal(row.manifest_source, 'builtin');

      const benchmarks = await benchmarkStore.listDefinitions(projectRoot);
      assert(benchmarks.some((benchmark) => benchmark.id === 'marketing-campaign-brief'));
    });
  });
});
