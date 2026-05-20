import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { StateDbService } from './state-db.service';

const withTempHome = async (run: (homeDir: string) => Promise<void>) => {
  const homeDir = await mkdtemp(join(tmpdir(), 'cast-state-db-'));
  const previousHome = process.env.HOME;
  const previousStateDbPath = process.env.CAST_STATE_DB_PATH;
  process.env.HOME = homeDir;
  delete process.env.CAST_STATE_DB_PATH;
  try {
    await run(homeDir);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousStateDbPath === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousStateDbPath;
    }
    await rm(homeDir, { recursive: true, force: true });
  }
};

describe('StateDbService', () => {
  test('creates state.db on demand with all core tables and pragmas', async () => {
    await withTempHome(async (homeDir) => {
      const service = new StateDbService();
      const db = await service.getDb();

      const tables = db.prepare("select name from sqlite_master where type in ('table', 'virtual') order by name").all()
        .map((row: any) => row.name);

      assert.equal(service.getDbPath(), join(homeDir, '.cast', 'state.db'));
      assert(tables.includes('state_meta'));
      assert(tables.includes('local_sessions'));
      assert(tables.includes('local_messages'));
      assert(tables.includes('local_tool_calls'));
      assert(tables.includes('local_state_fts'));
      assert(tables.includes('local_memory_entries'));
      assert(tables.includes('local_memory_fts'));
      assert.match(String(db.pragma('journal_mode', { simple: true })), /wal/i);
      assert.equal(db.pragma('busy_timeout', { simple: true }), 5000);
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1);

      await service.close();
    });
  });

  test('runs migrations idempotently', async () => {
    await withTempHome(async () => {
      const service = new StateDbService();
      await service.getDb();
      await service.runMigrations();

      const rows = service.getDbSync().prepare('select name from state_meta order by name').all();
      assert.deepEqual(rows.map((row: any) => row.name), [
        '0001_local_state_core',
        '0002_local_state_fts',
        '0003_benchmark_core',
        '0004_environment_activation',
        '0005_scheduler_core',
        '0006_local_memory',
        '0007_environment_profiles',
        '0008_swarm_core',
      ]);

      await service.close();
    });
  });

  test('retries transient busy write errors', async () => {
    await withTempHome(async () => {
      const service = new StateDbService();
      let attempts = 0;

      const result = await service.executeWrite(() => {
        attempts += 1;
        if (attempts < 3) {
          throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
        }
        return 'written';
      });

      assert.equal(result, 'written');
      assert.equal(attempts, 3);

      await service.close();
    });
  });
});
