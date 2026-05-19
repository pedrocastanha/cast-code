import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { LocalSessionStoreService } from './local-session-store.service';
import { StateDbService } from './state-db.service';
import { StateRedactionService } from './state-redaction.service';

const withStore = async (run: (store: LocalSessionStoreService, db: StateDbService) => Promise<void>) => {
  const homeDir = await mkdtemp(join(tmpdir(), 'cast-local-store-'));
  const previousHome = process.env.HOME;
  const previousStateDbPath = process.env.CAST_STATE_DB_PATH;
  process.env.HOME = homeDir;
  delete process.env.CAST_STATE_DB_PATH;
  const db = new StateDbService();
  const store = new LocalSessionStoreService(db, new StateRedactionService());
  try {
    await run(store, db);
  } finally {
    await db.close();
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

describe('LocalSessionStoreService', () => {
  test('persists session lifecycle summaries', async () => {
    await withStore(async (store, db) => {
      const session = await store.startSession({
        projectRoot: '/repo',
        platformProjectId: 'project-1',
        environmentId: 'env-1',
        model: 'gpt-test',
      });

      await store.endSession(session.id, { totalTokens: 123, totalCost: 0.45 });

      const row = db.getDbSync().prepare('select * from local_sessions where id = ?').get(session.id) as any;
      assert.equal(row.project_root, '/repo');
      assert.equal(row.platform_project_id, 'project-1');
      assert.equal(row.environment_id, 'env-1');
      assert.equal(row.model, 'gpt-test');
      assert.equal(row.total_tokens, 123);
      assert.equal(row.total_cost, 0.45);
      assert.ok(row.ended_at);
    });
  });

  test('persists redacted messages and tool calls and searches them with FTS', async () => {
    await withStore(async (store, db) => {
      const session = await store.startSession({ projectRoot: '/repo' });
      const message = await store.recordMessage({
        sessionId: session.id,
        role: 'user',
        redactedContent: 'Authorization: Bearer abc.def.ghi please inspect auth flow',
      });
      await store.recordToolCall({
        sessionId: session.id,
        messageId: message.id,
        toolName: 'shell',
        inputRedacted: 'OPENAI_API_KEY=sk-test-value npm test',
        outputPreview: 'auth flow passed',
        status: 'ok',
        latencyMs: 12,
      });

      const storedMessage = db.getDbSync().prepare('select * from local_messages where id = ?').get(message.id) as any;
      const storedTool = db.getDbSync().prepare('select * from local_tool_calls where session_id = ?').get(session.id) as any;

      assert.doesNotMatch(storedMessage.redacted_content, /abc\.def\.ghi/);
      assert.doesNotMatch(storedTool.input_redacted, /sk-test-value/);
      assert.match(storedMessage.content_hash, /^[a-f0-9]{64}$/);

      const results = await store.search('auth', 10);
      assert.equal(results.length >= 2, true);
      assert(results.some((result) => result.kind === 'message' && result.sessionId === session.id));
      assert(results.some((result) => result.kind === 'tool_call' && result.sessionId === session.id));
    });
  });

  test('returns an empty result for invalid FTS syntax', async () => {
    await withStore(async (store) => {
      assert.deepEqual(await store.search('"unterminated', 10), []);
    });
  });

  test('returns no session instead of throwing for hyphenated resume selectors', async () => {
    await withStore(async (store) => {
      assert.equal(await store.findSession('missing-session', '/repo'), null);
    });
  });

  test('lists and searches sessions with activity summaries', async () => {
    await withStore(async (store) => {
      const session = await store.startSession({ projectRoot: '/repo', model: 'gpt-test' });
      await store.recordMessage({
        sessionId: session.id,
        role: 'user',
        redactedContent: 'We improved scheduler presets and session resume.',
      });
      await store.recordMessage({
        sessionId: session.id,
        role: 'assistant',
        redactedContent: 'Implemented weekly schedule presets.',
      });
      await store.recordToolCall({
        sessionId: session.id,
        toolName: 'shell',
        outputPreview: 'scheduler tests passed',
        status: 'ok',
      });

      const listed = await store.listSessions('/repo', 10);
      assert.equal(listed.length, 1);
      assert.equal(listed[0].id, session.id);
      assert.equal(listed[0].messageCount, 2);
      assert.equal(listed[0].toolCallCount, 1);
      assert.match(listed[0].preview ?? '', /Implemented weekly schedule presets/);

      const matches = await store.searchSessions('scheduler', '/repo', 10);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].id, session.id);
      assert.match(matches[0].preview ?? '', /scheduler/);
    });
  });
});
