import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SessionTrackerService } from './session-tracker.service';
import { PlatformConfig } from '../types';

const config: PlatformConfig = {
  enabled: true,
  projectRoot: '/tmp/project',
  projectId: 'project-1',
  apiKeyEnv: 'CAST_API_KEY',
  apiUrl: 'https://api.cast.test',
};

describe('SessionTrackerService', () => {
  test('starts, sanitizes events, flushes, and closes a session', async () => {
    const posted: unknown[] = [];
    const closed: unknown[] = [];
    const client = {
      openSession: async () => ({ sessionId: 'session-1' }),
      postEvents: async (_config: unknown, _apiKey: unknown, _sessionId: unknown, events: unknown[]) => {
        posted.push(...events);
      },
      closeSession: async (_config: unknown, _apiKey: unknown, _sessionId: unknown, body: unknown) => {
        closed.push(body);
      },
    };
    const cache = {
      appendPendingEvents: async () => {},
      readPendingEvents: async () => [],
      clearPendingEvents: async () => {},
    };
    const tracker = new SessionTrackerService(client as any, cache as any);

    await tracker.start(config, 'secret-key', 'project-1', { castVersion: '1.0.0', os: 'linux', nodeVersion: 'v20' });
    tracker.track('command.run', { command: '/help', prompt: 'must not leak' });
    await tracker.close({ totalTokens: 3, totalCost: 0.01, duration: 10 });

    assert.equal(posted.length >= 2, true);
    assert.deepEqual((posted[1] as any).payload, { command: '/help' });
    assert.equal((posted[1] as any).payload.prompt, undefined);
    assert.equal(closed.length, 1);
  });

  test('does not send zero token totals when close summary omits totals', async () => {
    const closed: unknown[] = [];
    const client = {
      openSession: async () => ({ sessionId: 'session-1' }),
      postEvents: async () => {},
      closeSession: async (_config: unknown, _apiKey: unknown, _sessionId: unknown, body: unknown) => {
        closed.push(body);
      },
    };
    const cache = {
      appendPendingEvents: async () => {},
      readPendingEvents: async () => [],
      clearPendingEvents: async () => {},
    };
    const tracker = new SessionTrackerService(client as any, cache as any);

    await tracker.start(config, 'secret-key', 'project-1');
    await tracker.close();

    assert.equal((closed[0] as any).totalTokens, undefined);
    assert.equal((closed[0] as any).totalCost, undefined);
  });

  test('failed flush appends events to pending queue', async () => {
    const pending: unknown[] = [];
    const client = {
      openSession: async () => ({ sessionId: 'session-1' }),
      postEvents: async () => {
        throw new Error('offline');
      },
      closeSession: async () => {},
    };
    const cache = {
      appendPendingEvents: async (_root: string, events: unknown[]) => pending.push(...events),
      readPendingEvents: async () => [],
      clearPendingEvents: async () => {},
    };
    const tracker = new SessionTrackerService(client as any, cache as any);

    await tracker.start(config, 'secret-key', 'project-1', { castVersion: '1.0.0', os: 'linux', nodeVersion: 'v20' });
    tracker.track('command.run', { command: '/help' });
    await tracker.flush();
    tracker.stopTimer();

    assert.equal(pending.length, 2);
  });

  test('open session failure persists session started event for later sync', async () => {
    const pending: unknown[] = [];
    const client = {
      openSession: async () => {
        throw new Error('session endpoint down');
      },
      postEvents: async () => {},
      closeSession: async () => {},
    };
    const cache = {
      appendPendingEvents: async (_root: string, events: unknown[]) => pending.push(...events),
      readPendingEvents: async () => [],
      clearPendingEvents: async () => {},
    };
    const tracker = new SessionTrackerService(client as any, cache as any);

    await tracker.start(config, 'secret-key', 'project-1', { castVersion: '1.0.0', os: 'linux', nodeVersion: 'v20' });
    tracker.track('command.run', { command: '/help' });

    assert.equal(pending.length, 2);
    assert.equal((pending[0] as any).type, 'session.started');
    assert.equal((pending[1] as any).type, 'command.run');
  });

  test('close before async session start resolves does not leave a live session timer', async () => {
    let resolveOpenSession: (value: { sessionId: string }) => void = () => {};
    const client = {
      openSession: async () => new Promise<{ sessionId: string }>((resolve) => {
        resolveOpenSession = resolve;
      }),
      postEvents: async () => {},
      closeSession: async () => {},
    };
    const cache = {
      appendPendingEvents: async () => {},
      readPendingEvents: async () => [],
      clearPendingEvents: async () => {},
    };
    const tracker = new SessionTrackerService(client as any, cache as any);

    const start = tracker.start(config, 'secret-key', 'project-1');
    await new Promise((resolve) => setImmediate(resolve));
    await tracker.close();
    resolveOpenSession({ sessionId: 'session-1' });
    await start;

    assert.equal((tracker as any).sessionId, null);
    assert.equal((tracker as any).flushInterval, null);
  });
});
