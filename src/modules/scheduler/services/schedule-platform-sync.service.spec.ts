import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { PlatformClientError, PlatformClientService } from '../../platform/services/platform-client.service';
import { PlatformConfigService } from '../../platform/services/platform-config.service';
import type { ScheduleDefinition, ScheduleRun } from '../types';
import { SchedulePlatformSyncService } from './schedule-platform-sync.service';

const schedule = (projectRoot: string): ScheduleDefinition => ({
  id: 'schedule-1',
  projectRoot,
  name: 'Private campaign review',
  cronExpression: '0 9 * * *',
  status: 'active',
  target: {
    type: 'agent_prompt',
    ref: 'Private campaign review',
    config: {
      prompt: 'raw prompt with sk-testsecret123',
      input: 'raw input kept local',
      expected: 'raw expected kept local',
      dryRun: true,
    },
  },
  approvalPolicy: 'dry-run-only',
  budget: { maxCases: 1, maxCostUsd: 1, maxTokens: 1000 },
  maxRuntimeMs: 60_000,
  createdAt: '2026-05-11T00:00:00.000Z',
  updatedAt: '2026-05-11T00:00:00.000Z',
});

const run = (projectRoot: string): ScheduleRun => ({
  id: 'run-1',
  scheduleId: 'schedule-1',
  projectRoot,
  status: 'failed',
  startedAt: '2026-05-11T00:00:00.000Z',
  completedAt: '2026-05-11T00:00:01.000Z',
  targetType: 'agent_prompt',
  error: 'raw prompt with sk-testsecret123 failed',
});

const withLinkedProject = async (execute: (context: { projectRoot: string }) => Promise<void>) => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'cast-schedule-platform-sync-'));
  const previousKey = process.env.CAST_API_KEY;
  process.env.CAST_API_KEY = 'secret-key';
  await mkdir(join(projectRoot, '.cast'), { recursive: true });
  await writeFile(join(projectRoot, '.cast', 'cast.yaml'), [
    'version: 1',
    'platform:',
    '  projectId: project-1',
    '  apiUrl: http://localhost:3022',
    '  apiKeyEnv: CAST_API_KEY',
  ].join('\n'));

  try {
    await execute({ projectRoot });
  } finally {
    if (previousKey === undefined) delete process.env.CAST_API_KEY;
    else process.env.CAST_API_KEY = previousKey;
    await rm(projectRoot, { recursive: true, force: true });
  }
};

test('syncDefinition sends schedule metadata without raw prompt, input, or expected content', async () => {
  await withLinkedProject(async ({ projectRoot }) => {
    let posted: any;
    const client = {
      createSchedule: async (_config: unknown, _apiKey: string, body: any) => {
        posted = body;
        return { ...body, id: 'remote-schedule-1' };
      },
    } as unknown as PlatformClientService;

    const service = new SchedulePlatformSyncService(new PlatformConfigService(), client);
    const result = await service.syncDefinition(schedule(projectRoot));

    assert.equal(result.status, 'synced');
    assert.equal(posted.target.config.localScheduleId, 'schedule-1');
    assert.equal(posted.target.config.privacy.rawTargetConfig, false);
    assert.equal(posted.target.config.content.prompt.storedLocally, true);
    const json = JSON.stringify(posted);
    assert.doesNotMatch(json, /raw prompt/);
    assert.doesNotMatch(json, /raw input kept local/);
    assert.doesNotMatch(json, /raw expected kept local/);
    assert.doesNotMatch(json, /sk-testsecret123/);
  });
});

test('syncRun and pending schedule queue do not persist raw schedule content or errors', async () => {
  await withLinkedProject(async ({ projectRoot }) => {
    const client = {
      createSchedule: async () => {
        throw new PlatformClientError('offline', 'network');
      },
    } as unknown as PlatformClientService;

    const service = new SchedulePlatformSyncService(new PlatformConfigService(), client);
    const result = await service.syncRun(schedule(projectRoot), run(projectRoot));
    const pending = JSON.parse(await readFile(join(projectRoot, '.cast', 'platform.pending-schedule-sync.json'), 'utf-8'));
    const json = JSON.stringify(pending);

    assert.equal(result.status, 'queued');
    assert.equal(pending.length, 1);
    assert.doesNotMatch(json, /raw prompt/);
    assert.doesNotMatch(json, /raw input kept local/);
    assert.doesNotMatch(json, /raw expected kept local/);
    assert.doesNotMatch(json, /sk-testsecret123/);
    assert.equal(pending[0].run.error.storedLocally, true);
  });
});

test('syncRun uses benchmark lab web URL override for schedule links', async () => {
  const previousWebUrl = process.env.CAST_BENCHMARK_LAB_WEB_URL;
  process.env.CAST_BENCHMARK_LAB_WEB_URL = 'http://localhost:3033/';

  try {
    await withLinkedProject(async ({ projectRoot }) => {
      const client = {
        createSchedule: async (_config: unknown, _apiKey: string, body: any) => ({
          ...body,
          id: 'remote-schedule-1',
        }),
        createScheduleRun: async (_config: unknown, _apiKey: string, _scheduleId: string, body: any) => ({
          ...body,
          id: 'remote-run-1',
        }),
      } as unknown as PlatformClientService;

      const service = new SchedulePlatformSyncService(new PlatformConfigService(), client);
      const result = await service.syncRun(schedule(projectRoot), run(projectRoot));

      assert.equal(result.status, 'synced');
      assert.equal(result.webUrl, 'http://localhost:3033/projects/project-1/schedules/remote-schedule-1');
    });
  } finally {
    if (previousWebUrl === undefined) delete process.env.CAST_BENCHMARK_LAB_WEB_URL;
    else process.env.CAST_BENCHMARK_LAB_WEB_URL = previousWebUrl;
  }
});
