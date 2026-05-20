import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, test } from 'node:test';
import { BridgeRuntimeService } from './bridge-runtime.service';
import { BridgeProtocolService } from './bridge-protocol.service';

class FakeSession extends EventEmitter {
  writes: string[] = [];

  async write(value: string) {
    this.writes.push(value);
    if (value.includes('<cast_user_turn')) {
      this.emit('data', '<cast_tool_call id="call_1">{"name":"read_file","arguments":{"path":"package.json"}}</cast_tool_call>');
    }
    if (value.trimStart().startsWith('<cast_tool_result')) {
      this.emit('data', 'Scripts: build, test\n<cast_turn_done/>');
    }
  }

  onData(listener: (chunk: string) => void) {
    this.on('data', listener);
  }

  onceExit(listener: () => void) {
    this.once('exit', listener);
  }

  getStatus() {
    return 'connected';
  }

  getProviderId() {
    return 'claude';
  }

  getProviderLabel() {
    return 'Claude CLI';
  }

  requiresToolResultFollowup() {
    return false;
  }
}

describe('BridgeRuntimeService', () => {
  test('executes provider tool calls and returns final text', async () => {
    const session = new FakeSession();
    const executed: string[] = [];
    const runtime = new BridgeRuntimeService(
      session as any,
      new BridgeProtocolService(),
      {
        getManifest: () => ({
          tools: [{ name: 'read_file', description: 'read', inputSchema: {} }],
        }),
        execute: async (call: any) => {
          executed.push(call.name);
          return {
            id: call.id,
            name: call.name,
            status: 'ok',
            content: '{"scripts":{"build":"x","test":"y"}}',
          };
        },
      } as any,
      { append: async () => '' } as any,
    );

    const result = await runtime.runUserTurn(
      { id: 'turn_1', message: 'read package' },
      { projectRoot: process.cwd() },
    );

    assert.deepEqual(executed, ['read_file']);
    assert.match(result.output, /Scripts/);
    assert.equal(result.toolRounds, 1);
  });

  test('ignores provider-invented tool results and follows up with Cast results', async () => {
    class OneShotSession extends EventEmitter {
      starts = 0;
      writes: string[] = [];

      async start() {
        this.starts++;
      }

      async write(value: string) {
        this.writes.push(value);
        if (value.trimStart().startsWith('<cast_tool_result')) {
          return;
        }
        if (value.includes('Cast tool results:')) {
          this.emit('data', 'Correct scripts from Cast result.<cast_turn_done/>');
          return;
        }
        this.emit('data', [
          'Reading package.json.',
          '<cast_tool_call id="call_1">{"name":"read_file","arguments":{"path":"package.json"}}</cast_tool_call>',
          '<cast_tool_result id="call_1">wrong stale package data</cast_tool_result>',
          'Wrong stale answer.<cast_turn_done/>',
        ].join('\n'));
      }

      onData(listener: (chunk: string) => void) {
        this.on('data', listener);
      }

      onceExit(listener: () => void) {
        this.once('exit', listener);
      }

      getProviderId() {
        return 'claude';
      }

      getProviderLabel() {
        return 'Claude CLI';
      }

      requiresToolResultFollowup() {
        return false;
      }
    }

    const session = new OneShotSession();
    const runtime = new BridgeRuntimeService(
      session as any,
      new BridgeProtocolService(),
      {
        getManifest: () => ({
          tools: [{ name: 'read_file', description: 'read', inputSchema: {} }],
        }),
        execute: async (call: any) => ({
          id: call.id,
          name: call.name,
          status: 'ok',
          content: '{"scripts":{"build":"node scripts/build-fast.mjs"}}',
        }),
      } as any,
      { append: async () => '' } as any,
    );

    const result = await runtime.runUserTurn(
      { id: 'turn_2', message: 'read package' },
      { projectRoot: process.cwd() },
    );

    assert.equal(session.starts, 1);
    assert.equal(result.output, 'Correct scripts from Cast result.');
    assert.equal(result.toolRounds, 1);
  });

  test('waits longer for the first provider byte than the per-turn idle timeout', async () => {
    class SlowFirstByteSession extends EventEmitter {
      async write(value: string) {
        if (value.includes('<cast_user_turn')) {
          this.emit('data', '');
          setTimeout(() => {
            this.emit('data', 'Delayed provider response.<cast_turn_done/>');
          }, 30);
        }
      }

      onData(listener: (chunk: string) => void) {
        this.on('data', listener);
      }

      onceExit(listener: () => void) {
        this.once('exit', listener);
      }

      getProviderId() {
        return 'claude';
      }

      getProviderLabel() {
        return 'Claude CLI';
      }

      requiresToolResultFollowup() {
        return false;
      }
    }

    const runtime = new BridgeRuntimeService(
      new SlowFirstByteSession() as any,
      new BridgeProtocolService(),
      {
        getManifest: () => ({ tools: [] }),
        execute: async () => ({ id: 'x', name: 'x', status: 'ok', content: '' }),
      } as any,
      { append: async () => '' } as any,
    );

    const result = await runtime.runUserTurn(
      { id: 'turn_slow_first_byte', message: 'respond slowly' },
      { projectRoot: process.cwd(), idleMs: 5, firstByteMs: 100 },
    );

    assert.equal(result.output, 'Delayed provider response.');
  });

  test('emits output chunks while collecting the final bridge response', async () => {
    class StreamingSession extends EventEmitter {
      async write(value: string) {
        if (value.includes('<cast_user_turn')) {
          this.emit('data', 'chunk-one');
          this.emit('data', 'chunk-two<cast_turn_done/>');
        }
      }

      onData(listener: (chunk: string) => void) {
        this.on('data', listener);
      }

      onceExit(listener: () => void) {
        this.once('exit', listener);
      }

      getProviderId() {
        return 'claude';
      }

      getProviderLabel() {
        return 'Claude CLI';
      }

      requiresToolResultFollowup() {
        return false;
      }
    }

    const chunks: string[] = [];
    const runtime = new BridgeRuntimeService(
      new StreamingSession() as any,
      new BridgeProtocolService(),
      {
        getManifest: () => ({ tools: [] }),
        execute: async () => ({ id: 'x', name: 'x', status: 'ok', content: '' }),
      } as any,
      { append: async () => '' } as any,
    );

    const result = await runtime.runUserTurn(
      { id: 'turn_streaming', message: 'stream' },
      { projectRoot: process.cwd(), onOutputChunk: (chunk) => chunks.push(chunk) },
    );

    assert.deepEqual(chunks, ['chunk-one', 'chunk-two']);
    assert.equal(result.output, 'chunk-onechunk-two');
  });

  test('falls back to Cast tool results when response-only follow-up is empty', async () => {
    class EmptyFollowupSession extends EventEmitter {
      starts = 0;
      writes: string[] = [];

      async start() {
        this.starts++;
      }

      async write(value: string) {
        this.writes.push(value);
        if (value.trimStart().startsWith('<cast_tool_result')) {
          return;
        }
        if (value.includes('Cast tool results:')) {
          return;
        }
        this.emit('data', [
          '<cast_tool_call id="call_1">{"name":"read_file","arguments":{"path":"package.json"}}</cast_tool_call>',
          '<cast_turn_done/>',
        ].join('\n'));
      }

      onData(listener: (chunk: string) => void) {
        this.on('data', listener);
      }

      onceExit(listener: () => void) {
        this.once('exit', listener);
      }

      getProviderId() {
        return 'claude';
      }

      getProviderLabel() {
        return 'Claude CLI';
      }

      requiresToolResultFollowup() {
        return false;
      }
    }

    const session = new EmptyFollowupSession();
    const runtime = new BridgeRuntimeService(
      session as any,
      new BridgeProtocolService(),
      {
        getManifest: () => ({
          tools: [{ name: 'read_file', description: 'read', inputSchema: {} }],
        }),
        execute: async (call: any) => ({
          id: call.id,
          name: call.name,
          status: 'ok',
          content: [
            '{',
            '  "scripts": {',
            '    "build": "node scripts/build-fast.mjs",',
            '    "test": "node --test",',
            '    "typecheck": "tsc --noEmit"',
            '  }',
            '}',
          ].join('\n'),
        }),
      } as any,
      { append: async () => '' } as any,
    );

    const result = await runtime.runUserTurn(
      { id: 'turn_3', message: 'Leia package.json e liste exatamente 3 scripts existentes.' },
      { projectRoot: process.cwd(), idleMs: 20, firstByteMs: 20 },
    );

    assert.equal(session.starts, 1);
    assert.match(result.output, /`build` - `node scripts\/build-fast\.mjs`/);
    assert.match(result.output, /`test` - `node --test`/);
    assert.equal(result.toolRounds, 1);
  });
});
