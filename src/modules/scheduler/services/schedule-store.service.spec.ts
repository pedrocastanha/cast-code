import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { StateDbService } from '../../state/services/state-db.service';
import { ScheduleCronService } from './schedule-cron.service';
import { ScheduleStoreService } from './schedule-store.service';

const withStore = async (run: (store: ScheduleStoreService, db: StateDbService, root: string) => Promise<void>) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cast-schedule-store-'));
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(tempDir, 'state.db');
  const db = new StateDbService();
  const store = new ScheduleStoreService(db, new ScheduleCronService());

  try {
    await run(store, db, tempDir);
  } finally {
    await db.close();
    if (previousDb === undefined) {
      delete process.env.CAST_STATE_DB_PATH;
    } else {
      process.env.CAST_STATE_DB_PATH = previousDb;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
};

describe('ScheduleStoreService', () => {
  test('creates scheduler tables through local state migrations', async () => {
    await withStore(async (_store, db) => {
      const database = await db.getDb();
      const tables = database.prepare('select name from sqlite_master where type = \'table\' order by name').all()
        .map((row: any) => row.name);

      assert(tables.includes('local_schedules'));
      assert(tables.includes('local_schedule_runs'));
    });
  });

  test('saves, lists, pauses, and records runs', async () => {
    await withStore(async (store, _db, projectRoot) => {
      const schedule = await store.save({
        id: 'schedule-1',
        projectRoot,
        name: 'Hourly benchmark',
        cronExpression: '0 * * * *',
        target: { type: 'benchmark', ref: 'bench-1', config: { definitionId: 'bench-1' } },
        approvalPolicy: 'dry-run-only',
        budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000 },
        maxRuntimeMs: 60_000,
      });

      assert.equal(schedule.id, 'schedule-1');
      assert.equal(schedule.status, 'active');
      assert.equal(schedule.sandbox?.mode, 'snapshot');
      assert.ok(schedule.nextRunAt);

      const listed = await store.list(projectRoot);
      assert.equal(listed.length, 1);
      assert.equal(listed[0].target.type, 'benchmark');

      const paused = await store.setStatus(schedule.id, 'paused');
      assert.equal(paused?.status, 'paused');

      const run = await store.createRun(schedule, schedule.nextRunAt);
      const completed = await store.updateRun(run, {
        status: 'completed',
        completedAt: '2026-05-11T10:00:00.000Z',
        summary: { ok: true },
      });

      assert.equal(completed.status, 'completed');
      assert.deepEqual(completed.summary, { ok: true });
      assert.equal((await store.listRuns(schedule.id)).length, 1);
      assert.equal((await store.listProjectRuns(projectRoot)).length, 1);
    });
  });
});
