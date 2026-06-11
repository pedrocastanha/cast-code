import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KeyDecoder, KeyEvent } from './key-decoder';

function feed(decoder: KeyDecoder, data: string): KeyEvent[] {
  return decoder.feed(data);
}

describe('KeyDecoder', () => {
  test('plain chars become char events', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, 'ab'), [
      { type: 'char', char: 'a' },
      { type: 'char', char: 'b' },
    ]);
  });

  test('CR is enter, LF is newline (Ctrl+J)', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\r'), [{ type: 'enter' }]);
    assert.deepEqual(feed(d, '\n'), [{ type: 'newline' }]);
  });

  test('kitty Ctrl+Enter CSI-u sequence is newline', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[13;5u'), [{ type: 'newline' }]);
  });

  test('kitty plain Enter CSI-u sequence is enter', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[13u'), [{ type: 'enter' }]);
  });

  test('arrows, home, end, delete, shift-tab', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[A'), [{ type: 'up' }]);
    assert.deepEqual(feed(d, '\x1b[B'), [{ type: 'down' }]);
    assert.deepEqual(feed(d, '\x1b[C'), [{ type: 'right' }]);
    assert.deepEqual(feed(d, '\x1b[D'), [{ type: 'left' }]);
    assert.deepEqual(feed(d, '\x1b[H'), [{ type: 'home' }]);
    assert.deepEqual(feed(d, '\x1b[F'), [{ type: 'end' }]);
    assert.deepEqual(feed(d, '\x1b[3~'), [{ type: 'delete' }]);
    assert.deepEqual(feed(d, '\x1b[Z'), [{ type: 'shift-tab' }]);
  });

  test('control chars map to ctrl events', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x03'), [{ type: 'ctrl', key: 'c' }]);
    assert.deepEqual(feed(d, '\x04'), [{ type: 'ctrl', key: 'd' }]);
    assert.deepEqual(feed(d, '\x0f'), [{ type: 'ctrl', key: 'o' }]);
    assert.deepEqual(feed(d, '\x17'), [{ type: 'ctrl', key: 'w' }]);
  });

  test('backspace variants', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x7f'), [{ type: 'backspace' }]);
    assert.deepEqual(feed(d, '\x08'), [{ type: 'backspace' }]);
  });

  test('bracketed paste is one paste event with newlines preserved', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[200~line1\nline2\x1b[201~'), [
      { type: 'paste', text: 'line1\nline2' },
    ]);
  });

  test('paste split across feed calls buffers until terminator', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[200~part1'), []);
    assert.deepEqual(feed(d, ' part2\x1b[201~x'), [
      { type: 'paste', text: 'part1 part2' },
      { type: 'char', char: 'x' },
    ]);
  });

  test('escape sequence split across feed calls', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b'), []);
    assert.deepEqual(feed(d, '[A'), [{ type: 'up' }]);
  });

  test('unknown CSI sequences are swallowed, not leaked as chars', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[?1u'), []);
    assert.deepEqual(feed(d, 'a'), [{ type: 'char', char: 'a' }]);
  });

  test('multi-byte UTF-8 chars pass through as single char events', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, 'é🌰'), [
      { type: 'char', char: 'é' },
      { type: 'char', char: '🌰' },
    ]);
  });
});
