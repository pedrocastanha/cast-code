#!/usr/bin/env node
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(new URL('..', import.meta.url).pathname);
const tmpRoot = mkdtempSync(join(tmpdir(), 'cast-bridge-smoke-'));
const home = join(tmpRoot, 'home');
const replays = join(tmpRoot, 'replays');
const traces = join(tmpRoot, 'traces');
const fakeDebug = join(tmpRoot, 'fake.log');
mkdirSync(home, { recursive: true });
mkdirSync(replays, { recursive: true });
mkdirSync(traces, { recursive: true });

const malformed = process.env.FAKE_CLAUDE_MODE === 'malformed';
const scriptedInput = malformed
  ? '["force malformed protocol","/exit"]'
  : '["leia package.json e liste os scripts","/bridge status","/exit"]';

try {
  const result = spawnSync(process.execPath, [join(root, 'dist/main.js'), 'bridge', 'claude'], {
    cwd: root,
    env: {
      ...process.env,
      HOME: home,
      CAST_REPLAYS_DIR: replays,
      CAST_TRACE_DIR: traces,
      CAST_BRIDGE_CLAUDE_COMMAND: process.execPath,
      CAST_BRIDGE_CLAUDE_ARGS: join(root, 'scripts/fixtures/bridge/fake-claude-cli.mjs'),
      CAST_BRIDGE_DISABLE_PTY: '1',
      CAST_BRIDGE_TURN_IDLE_MS: '500',
      CAST_BRIDGE_SCRIPTED_INPUT: scriptedInput,
      FAKE_CLAUDE_DEBUG_FILE: fakeDebug,
      ...(malformed ? { FAKE_CLAUDE_MODE: 'malformed' } : {}),
    },
    encoding: 'utf8',
    timeout: 10_000,
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`bridge command exited ${result.status}\n${output}`);
  }

  if (malformed) {
    if (!/Protocol error handled/i.test(output)) {
      throw new Error(`expected protocol error handling output\n${output}`);
    }
  } else {
    for (const expected of ['Scripts: build, test, typecheck', 'Claude CLI', 'connected']) {
      if (!output.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(`missing expected output "${expected}"\n${output}`);
      }
    }
  }

  console.log('bridge claude smoke passed');
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
