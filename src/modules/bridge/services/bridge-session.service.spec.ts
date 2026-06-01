import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, test } from 'node:test';
import { BridgeSessionService } from './bridge-session.service';
import { ClaudeBridgeAdapter, CliBridgeAdapter } from '../providers/claude-bridge-adapter';

class FakePty extends EventEmitter {
  writes: string[] = [];
  killed = false;

  write(value: string) {
    this.writes.push(value);
  }

  endInput() {}

  kill() {
    this.killed = true;
    this.emit('exit', 0);
  }

  resize() {}
}

describe('BridgeSessionService', () => {
  const rawAdapter = () => new ClaudeBridgeAdapter({ CAST_BRIDGE_CLAUDE_COMMAND: 'node' } as any);

  test('starts a provider session and writes input', async () => {
    const fake = new FakePty();
    const service = new BridgeSessionService(rawAdapter(), {
      spawn: () => fake as any,
    });

    await service.start({ cwd: process.cwd() });
    await service.write('hello');

    assert.equal(service.getStatus(), 'connected');
    assert.deepEqual(fake.writes, ['hello\n']);
  });

  test('waits for async provider writes to flush', async () => {
    const fake = new FakePty();
    let flushed = false;
    fake.write = async (value: string) => {
      fake.writes.push(value);
      await new Promise((resolve) => setTimeout(resolve, 5));
      flushed = true;
    };
    const service = new BridgeSessionService(rawAdapter(), {
      spawn: () => fake as any,
    });

    await service.start({ cwd: process.cwd() });
    await service.write('hello');

    assert.equal(flushed, true);
    assert.deepEqual(fake.writes, ['hello\n']);
  });

  test('ends stdin after writing to one-shot providers', async () => {
    const fake = new FakePty();
    let inputEnded = false;
    fake.endInput = () => {
      inputEnded = true;
    };
    const adapter = rawAdapter();
    (adapter as any).closeInputAfterWrite = () => true;
    const service = new BridgeSessionService(adapter as any, {
      spawn: () => fake as any,
    });

    await service.start({ cwd: process.cwd() });
    await service.write('hello');

    assert.equal(inputEnded, true);
  });


  test('collects output chunks and reports exit', async () => {
    const fake = new FakePty();
    const service = new BridgeSessionService(rawAdapter(), {
      spawn: () => fake as any,
    });
    const chunks: string[] = [];
    service.onData((chunk) => chunks.push(chunk));

    await service.start({ cwd: process.cwd() });
    fake.emit('data', 'provider output');
    fake.kill();

    assert.deepEqual(chunks, ['provider output']);
    assert.equal(service.getStatus(), 'disconnected');
  });

  test('forces pipe transport for json provider sessions', async () => {
    const fake = new FakePty();
    let spawnedArgs: string[] = [];
    let spawnedEnv: NodeJS.ProcessEnv = {};
    const service = new BridgeSessionService(new ClaudeBridgeAdapter({} as any), {
      spawn: (_command, args, options) => {
        spawnedArgs = args;
        spawnedEnv = options.env;
        return fake as any;
      },
    });

    await service.start({ cwd: process.cwd() });

    assert(spawnedArgs.includes('stream-json'));
    assert.equal(spawnedEnv.CAST_BRIDGE_DISABLE_PTY, '1');
  });

  test('forces pipe transport for codex json sessions', async () => {
    const fake = new FakePty();
    let spawnedArgs: string[] = [];
    let spawnedEnv: NodeJS.ProcessEnv = {};
    const service = new BridgeSessionService(new CliBridgeAdapter('codex', {} as any), {
      spawn: (_command, args, options) => {
        spawnedArgs = args;
        spawnedEnv = options.env;
        return fake as any;
      },
    });

    await service.start({ cwd: process.cwd() });

    assert(spawnedArgs.includes('--json'));
    assert.equal(spawnedEnv.CAST_BRIDGE_DISABLE_PTY, '1');
  });
});
