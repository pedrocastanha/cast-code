import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectKittyProtocol, KITTY_ENABLE, KITTY_DISABLE } from './kitty-protocol';
import { EventEmitter } from 'node:events';

function fakeStdin(): NodeJS.ReadStream & EventEmitter {
  const emitter = new EventEmitter() as any;
  emitter.isTTY = true;
  return emitter;
}

describe('detectKittyProtocol', () => {
  test('resolves true when terminal replies with CSI ? u before device attributes', async () => {
    const stdin = fakeStdin();
    const writes: string[] = [];
    const promise = detectKittyProtocol({
      stdin,
      write: (s) => writes.push(s),
      timeoutMs: 1000,
    });
    stdin.emit('data', '\x1b[?0u\x1b[?62c');
    assert.equal(await promise, true);
    assert.equal(writes.join(''), '\x1b[?u\x1b[c');
  });

  test('resolves false when only device attributes reply arrives', async () => {
    const stdin = fakeStdin();
    const promise = detectKittyProtocol({
      stdin,
      write: () => {},
      timeoutMs: 1000,
    });
    stdin.emit('data', '\x1b[?62c');
    assert.equal(await promise, false);
  });

  test('resolves false on timeout', async () => {
    const stdin = fakeStdin();
    const result = await detectKittyProtocol({
      stdin,
      write: () => {},
      timeoutMs: 10,
    });
    assert.equal(result, false);
  });

  test('resolves false immediately when stdin is not a TTY', async () => {
    const stdin = fakeStdin();
    (stdin as any).isTTY = false;
    const result = await detectKittyProtocol({
      stdin,
      write: () => {},
      timeoutMs: 1000,
    });
    assert.equal(result, false);
  });

  test('enable/disable sequences are the kitty push/pop codes', () => {
    assert.equal(KITTY_ENABLE, '\x1b[>1u');
    assert.equal(KITTY_DISABLE, '\x1b[<u');
  });
});
