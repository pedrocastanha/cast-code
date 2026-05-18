import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ScheduleCronService } from '../services/schedule-cron.service';
import { ScheduleCommandsService } from './schedule-commands.service';

const captureStdout = async (run: () => Promise<void>): Promise<string> => {
  const previousWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
    return output;
  } finally {
    process.stdout.write = previousWrite;
  }
};

const scheduleFixture = {
  id: 'schedule-1',
  projectRoot: process.cwd(),
  name: 'Weekly report',
  description: 'Prepare weekly project health report.',
  cronExpression: '0 9 * * 1',
  status: 'active',
  target: { type: 'report', ref: 'Weekly report', config: { prompt: 'Summarize project health' } },
  approvalPolicy: 'dry-run-only',
  budget: { maxCases: 1, maxCostUsd: 0.5, maxTokens: 20_000, allowLlmJudge: false },
  sandbox: { mode: 'snapshot' },
  maxRuntimeMs: 600_000,
  nextRunAt: '2026-05-18T09:00:00.000Z',
  lastRunAt: '2026-05-11T09:00:00.000Z',
  tags: ['report'],
  createdAt: '2026-05-10T10:00:00.000Z',
  updatedAt: '2026-05-11T10:00:00.000Z',
} as any;

const runFixture = {
  id: 'run-1',
  scheduleId: 'schedule-1',
  projectRoot: process.cwd(),
  status: 'completed',
  startedAt: '2026-05-11T09:00:00.000Z',
  completedAt: '2026-05-11T09:00:30.000Z',
  targetType: 'report',
  summary: { passedCases: 1, failedCases: 0 },
  benchmarkRunId: 'bench-run-1',
} as any;

const createService = (overrides: {
  store?: Record<string, unknown>;
  runner?: Record<string, unknown>;
  suggestions?: Record<string, unknown>;
  platformSync?: Record<string, unknown>;
  worker?: Record<string, unknown>;
} = {}) => {
  const store = {
    list: async () => [],
    listDue: async () => [],
    get: async () => null,
    listRuns: async () => [],
    listProjectRuns: async () => [],
    save: async (input: any) => ({ ...scheduleFixture, ...input, id: input.id ?? 'created-schedule' }),
    setStatus: async () => scheduleFixture,
    ...overrides.store,
  };
  const runner = {
    runSchedule: async () => ({ schedule: scheduleFixture, run: runFixture }),
    runDue: async () => ({ checkedAt: '2026-05-15T10:00:00.000Z', runs: [] }),
    ...overrides.runner,
  };
  const suggestions = {
    list: async () => [],
    get: async () => null,
    toCreateInput: () => scheduleFixture,
    ...overrides.suggestions,
  };
  const platformSync = {
    syncDefinition: async () => ({ status: 'skipped' }),
    syncRun: async () => ({ status: 'skipped' }),
    ...overrides.platformSync,
  };
  const worker = {
    status: async () => ({
      platform: 'linux-systemd',
      supported: true,
      installed: false,
      projectRoot: process.cwd(),
      message: 'not installed',
      notes: [],
    }),
    install: async () => ({
      platform: 'linux-systemd',
      supported: true,
      installed: true,
      projectRoot: process.cwd(),
      timerName: 'cast-code-scheduler-test.timer',
      active: 'active',
      enabled: 'enabled',
      message: 'installed',
      notes: [],
    }),
    uninstall: async () => ({
      platform: 'linux-systemd',
      supported: true,
      installed: false,
      projectRoot: process.cwd(),
      message: 'removed',
      notes: [],
    }),
    ...overrides.worker,
  };
  return new ScheduleCommandsService(
    store as any,
    runner as any,
    new ScheduleCronService(),
    suggestions as any,
    platformSync as any,
    worker as any,
  );
};

describe('ScheduleCommandsService', () => {
  test('shows a scheduler dashboard with next steps when no schedules exist', async () => {
    const service = createService({
      suggestions: {
        list: async () => [{
          id: 'weekly-report',
          environmentId: 'engineering',
          name: 'Weekly report',
          description: 'Review engineering health.',
          cronExpression: '0 9 * * 1',
        }],
      },
    });

    const output = await captureStdout(() => service.cmdSchedule([]));

    assert.match(output, /Scheduler/);
    assert.match(output, /No schedules yet/);
    assert.match(output, /\/schedule create/);
    assert.match(output, /weekly-report/);
  });

  test('shows detailed schedule status with recent runs', async () => {
    const service = createService({
      store: {
        get: async () => scheduleFixture,
        listRuns: async () => [runFixture],
      },
    });

    const output = await captureStdout(() => service.cmdSchedule(['status', 'schedule-1']));

    assert.match(output, /Schedule/);
    assert.match(output, /Weekly report/);
    assert.match(output, /Next run/);
    assert.match(output, /run-1/);
    assert.match(output, /completed/);
  });

  test('guided create wizard chooses a schedule type before asking fields', async () => {
    let savedInput: any;
    const service = createService({
      store: {
        save: async (input: any) => {
          savedInput = input;
          return { ...scheduleFixture, ...input, id: 'created-report' };
        },
      },
    });
    const smartInput = {
      askChoice: async () => 'report',
      question: async (message: string) => {
        if (/prompt/i.test(message)) return 'Summarize project health';
        if (/cron/i.test(message)) return '0 9 * * 1';
        if (/name/i.test(message)) return 'Weekly project report';
        return '';
      },
    };

    const output = await captureStdout(() => service.cmdSchedule(['create'], smartInput));

    assert.equal(savedInput.target.type, 'report');
    assert.equal(savedInput.name, 'Weekly project report');
    assert.match(output, /created-report/);
    assert.match(output, /\/schedule run created-report/);
  });

  test('previews due schedules without running them', async () => {
    let runDueCalled = false;
    const service = createService({
      store: {
        listDue: async () => [scheduleFixture],
      },
      runner: {
        runDue: async () => {
          runDueCalled = true;
          return { checkedAt: '2026-05-15T10:00:00.000Z', runs: [] };
        },
      },
    });

    const output = await captureStdout(() => service.cmdSchedule(['due']));

    assert.equal(runDueCalled, false);
    assert.match(output, /Due schedules/);
    assert.match(output, /schedule-1/);
    assert.match(output, /\/schedule tick/);
  });

  test('creates schedules from human time presets without raw cron', async () => {
    let savedInput: any;
    const service = createService({
      store: {
        save: async (input: any) => {
          savedInput = input;
          return { ...scheduleFixture, ...input, id: 'weekly-human' };
        },
      },
    });

    await captureStdout(() => service.cmdSchedule([
      'create',
      'report',
      '--prompt',
      'Prepare weekly report',
      '--every',
      'weekly',
      '--weekday',
      'monday',
      '--at',
      '09:30',
    ]));

    assert.equal(savedInput.cronExpression, '30 9 * * 1');
  });

  test('installs a background worker from schedule commands', async () => {
    let installInput: any;
    const service = createService({
      worker: {
        install: async (input: any) => {
          installInput = input;
          return {
            platform: 'linux-systemd',
            supported: true,
            installed: true,
            projectRoot: input.projectRoot,
            timerName: 'cast-code-scheduler-test.timer',
            active: 'active',
            enabled: 'enabled',
            message: 'installed',
            notes: ['systemd user timer'],
          };
        },
      },
    });

    const output = await captureStdout(() => service.cmdSchedule(['worker', 'install', '--interval-seconds', '45']));

    assert.equal(installInput.projectRoot, process.cwd());
    assert.equal(installInput.intervalSeconds, 45);
    assert.match(output, /Schedule worker/);
    assert.match(output, /cast-code-scheduler-test\.timer/);
    assert.match(output, /systemd user timer/);
  });
});
