import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MultilineBuffer } from './multiline-buffer';

describe('MultilineBuffer', () => {
  test('starts empty with cursor at origin', () => {
    const b = new MultilineBuffer();
    assert.equal(b.text, '');
    assert.equal(b.isEmpty, true);
    assert.deepEqual(b.cursor, { row: 0, col: 0 });
  });

  test('insert advances cursor', () => {
    const b = new MultilineBuffer();
    b.insert('hello');
    assert.equal(b.text, 'hello');
    assert.deepEqual(b.cursor, { row: 0, col: 5 });
  });

  test('insert with embedded newlines splits lines', () => {
    const b = new MultilineBuffer();
    b.insert('a\nb\nc');
    assert.deepEqual([...b.getLines()], ['a', 'b', 'c']);
    assert.deepEqual(b.cursor, { row: 2, col: 1 });
  });

  test('newline splits current line at cursor', () => {
    const b = new MultilineBuffer();
    b.insert('hello');
    b.moveLeft();
    b.moveLeft();
    b.newline();
    assert.deepEqual([...b.getLines()], ['hel', 'lo']);
    assert.deepEqual(b.cursor, { row: 1, col: 0 });
  });

  test('backspace at line start joins lines', () => {
    const b = new MultilineBuffer();
    b.insert('ab\ncd');
    b.moveHome();
    b.backspace();
    assert.equal(b.text, 'abcd');
    assert.deepEqual(b.cursor, { row: 0, col: 2 });
  });

  test('backspace mid-line removes char before cursor', () => {
    const b = new MultilineBuffer();
    b.insert('abc');
    b.moveLeft();
    b.backspace();
    assert.equal(b.text, 'ac');
    assert.deepEqual(b.cursor, { row: 0, col: 1 });
  });

  test('deleteForward at line end joins next line', () => {
    const b = new MultilineBuffer();
    b.insert('ab\ncd');
    b.moveToStart();
    b.moveEnd();
    b.deleteForward();
    assert.equal(b.text, 'abcd');
  });

  test('up/down clamp column to line length', () => {
    const b = new MultilineBuffer();
    b.insert('long line\nab');
    assert.deepEqual(b.cursor, { row: 1, col: 2 });
    b.moveUp();
    assert.deepEqual(b.cursor, { row: 0, col: 2 });
    b.moveEnd();
    b.moveDown();
    assert.deepEqual(b.cursor, { row: 1, col: 2 });
  });

  test('moveUp on first row reports false (caller falls back to history)', () => {
    const b = new MultilineBuffer();
    b.insert('one');
    assert.equal(b.moveUp(), false);
    b.insert('\ntwo');
    assert.equal(b.moveUp(), true);
  });

  test('deleteWordBack removes trailing word and whitespace', () => {
    const b = new MultilineBuffer();
    b.insert('git commit  ');
    b.deleteWordBack();
    assert.equal(b.text, 'git ');
  });

  test('killToStart / killToEnd', () => {
    const b = new MultilineBuffer();
    b.insert('abcdef');
    b.moveLeft();
    b.moveLeft();
    b.killToEnd();
    assert.equal(b.text, 'abcd');
    b.killToStart();
    assert.equal(b.text, '');
  });

  test('setText replaces content and puts cursor at end', () => {
    const b = new MultilineBuffer();
    b.insert('old');
    b.setText('new\ntext');
    assert.equal(b.text, 'new\ntext');
    assert.deepEqual(b.cursor, { row: 1, col: 4 });
  });

  test('clear resets everything', () => {
    const b = new MultilineBuffer();
    b.insert('a\nb');
    b.clear();
    assert.equal(b.text, '');
    assert.deepEqual(b.cursor, { row: 0, col: 0 });
    assert.equal(b.lineCount, 1);
  });
});
