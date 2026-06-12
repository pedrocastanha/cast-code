import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { ResumeCommandsService } from './resume-commands.service';
import type { ReplaySession, ReplaySummary } from '../../../replay/services/replay.service';

const summaries: ReplaySummary[] = [
  { name: '(current session)', project: 'cast-code', model: 'claude', date: '6/12/2026', messages: 3, fileName: '_current.json' },
  { name: 'auth-refactor', project: 'cast-code', model: 'claude', date: '6/10/2026', messages: 5, fileName: 'auth-refactor.json' },
  { name: 'auth-bugfix', project: 'other', model: 'gpt', date: '6/9/2026', messages: 2, fileName: 'auth-bugfix.json' },
];

const session: ReplaySession = {
  id: 'abc',
  name: 'auth-refactor',
  project: '/home/u/cast-code',
  model: 'claude',
  createdAt: 1760000000000,
  entries: [
    { role: 'user', content: 'hello', timestamp: 1 },
    { role: 'assistant', content: 'hi there', timestamp: 2 },
    { role: 'tool', content: 'file list', toolName: 'ls', timestamp: 3 },
  ],
};

function makeService(overrides: { listResult?: ReplaySummary[]; choiceResult?: string } = {}) {
  const calls: { restored?: unknown[]; askedChoices?: Array<{ key: string; label: string }>; gotSession?: string } = {};
  const replayService = {
    list: () => overrides.listResult ?? summaries,
    getSession: (name: string) => { calls.gotSession = name; return session; },
  };
  const deepAgent = {
    restoreConversation: (entries: unknown[]) => { calls.restored = entries; return entries.length; },
  };
  const smartInput = {
    askChoice: async (_msg: string, choices: Array<{ key: string; label: string }>) => {
      calls.askedChoices = choices;
      return overrides.choiceResult ?? choices[0].key;
    },
  };
  const service = new ResumeCommandsService(replayService as never, deepAgent as never);
  return { service, calls, smartInput };
}

function captureStdout(): { output: () => string; restore: () => void } {
  let buf = '';
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: string) => { buf += chunk; return true; };
  return { output: () => buf, restore: () => { (process.stdout as { write: unknown }).write = original; } };
}

describe('ResumeCommandsService', () => {
  let cap: ReturnType<typeof captureStdout>;
  beforeEach(() => { cap?.restore(); });

  test('no args opens picker with all sessions and restores the chosen one', async () => {
    const { service, calls, smartInput } = makeService({ choiceResult: 'auth-refactor.json' });
    cap = captureStdout();
    await service.cmdResume([], smartInput as never);
    cap.restore();
    assert.equal(calls.askedChoices?.length, 3);
    assert.equal(calls.gotSession, 'auth-refactor');
    assert.equal((calls.restored as unknown[]).length, 3);
    assert.match(cap.output(), /hello/);
    assert.match(cap.output(), /Session resumed/i);
  });

  test('query filters the picker list', async () => {
    const { service, calls, smartInput } = makeService({ choiceResult: 'auth-bugfix.json' });
    cap = captureStdout();
    await service.cmdResume(['auth'], smartInput as never);
    cap.restore();
    assert.equal(calls.askedChoices?.length, 2);
  });

  test('unique query match skips the picker entirely', async () => {
    const { service, calls, smartInput } = makeService();
    cap = captureStdout();
    await service.cmdResume(['refactor'], smartInput as never);
    cap.restore();
    assert.equal(calls.askedChoices, undefined);
    assert.equal(calls.gotSession, 'auth-refactor');
  });

  test('cancel (empty key) restores nothing', async () => {
    const { service, calls, smartInput } = makeService({ choiceResult: '' });
    cap = captureStdout();
    await service.cmdResume([], smartInput as never);
    cap.restore();
    assert.equal(calls.restored, undefined);
  });

  test('no sessions prints a warning', async () => {
    const { service, calls, smartInput } = makeService({ listResult: [] });
    cap = captureStdout();
    await service.cmdResume([], smartInput as never);
    cap.restore();
    assert.equal(calls.askedChoices, undefined);
    assert.match(cap.output(), /No saved sessions/i);
  });

  test('no query match prints a warning', async () => {
    const { service, calls, smartInput } = makeService();
    cap = captureStdout();
    await service.cmdResume(['zzz-no-match'], smartInput as never);
    cap.restore();
    assert.equal(calls.restored, undefined);
    assert.match(cap.output(), /No session matches/i);
  });
});
