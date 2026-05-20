import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { StateDbService } from '../../state/services/state-db.service';
import { SwarmRunStoreService } from './swarm-run-store.service';
import type { SwarmPlan } from '../types';

const withStore = async (run: (store: SwarmRunStoreService, db: StateDbService, root: string) => Promise<void>) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cast-swarm-store-'));
  const previousDb = process.env.CAST_STATE_DB_PATH;
  process.env.CAST_STATE_DB_PATH = join(tempDir, 'state.db');
  const db = new StateDbService();
  const store = new SwarmRunStoreService(db);

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

describe('SwarmRunStoreService', () => {
  test('creates swarm tables through migrations', async () => {
    await withStore(async (_store, db) => {
      const database = await db.getDb();
      const tables = database.prepare("select name from sqlite_master where type = 'table' order by name").all()
        .map((row: any) => row.name);
      assert(tables.includes('swarm_plans'));
      assert(tables.includes('swarm_runs'));
      assert(tables.includes('swarm_task_runs'));
    });
  });

  test('saves and loads plans and runs', async () => {
    await withStore(async (store, _db, projectRoot) => {
      const plan: SwarmPlan = {
        id: 'plan-1',
        projectRoot,
        workspaceRoot: projectRoot,
        goal: 'Implement swarm',
        reasonForSwarm: 'Parallel surfaces',
        status: 'draft',
        integrationMode: 'apply_safe',
        runtimePolicy: { kind: 'default' },
        globalConstraints: { maxWorkers: 2 },
        tasks: [{
          id: 'cli',
          title: 'CLI',
          description: 'CLI work',
          dependsOn: [],
          worker: {
            id: 'cli-worker',
            kind: 'ephemeral_agent',
            name: 'cli-engineer',
            role: 'CLI engineer',
            systemPrompt: 'Build CLI.',
            handoffFormat: { summaryMaxChars: 500, includeDecisions: true, includeTestsRun: true },
          },
          fileOwnership: [{ glob: 'src/**' }],
          allowedTools: ['read_file', 'edit_file'],
          injectedSkills: [],
          discoverableSkills: [],
          acceptanceCriteria: [],
          focusedVerification: [],
        }],
        finalVerification: [],
        createdAt: '2026-05-20T10:00:00.000Z',
      };

      await store.savePlan(plan);
      const loaded = await store.getPlan('plan-1');
      assert.equal(loaded?.goal, 'Implement swarm');

      const run = await store.saveRun({
        id: 'run-1',
        planId: 'plan-1',
        status: 'approved',
        projectRoot,
        workspaceRoot: projectRoot,
        integrationMode: 'apply_safe',
        runtimePolicy: { kind: 'default' },
        tasks: [{
          id: 'task-run-1',
          planTaskId: 'cli',
          status: 'queued',
          workerId: 'cli-worker',
          worktreePath: '',
          branchName: 'cast/swarm/run-1/cli',
        }],
        createdAt: '2026-05-20T10:05:00.000Z',
      });

      assert.equal(run.id, 'run-1');
      assert.equal((await store.listRuns(projectRoot)).length, 1);
      assert.equal((await store.getRun('run-1'))?.tasks.length, 1);
    });
  });
});
