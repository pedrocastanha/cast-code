import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { InputBoxBlock } from './input-box-block';
import { stripAnsi } from '../cast-design/cli-renderer';

describe('InputBoxBlock', () => {
  test('renders bordered box with label and placeholder when empty', () => {
    const block = new InputBoxBlock({ placeholder: 'Type a message' });
    const lines = block.render(40).map(stripAnsi);
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^╭─+╮$/);
    assert.match(lines[1], /^│ › Type a message\s+│$/);
    assert.match(lines[2], /^╰─+╯$/);
  });

  test('renders buffer lines inside the box', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('hello\nworld');
    const lines = block.render(40).map(stripAnsi);
    assert.equal(lines.length, 4);
    assert.match(lines[1], /│ › hello\s+│/);
    assert.match(lines[2], /│ {3}world\s+│/);
  });

  test('wraps long lines to box width', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('a'.repeat(50));
    const lines = block.render(40).map(stripAnsi);
    // inner text width = 40 - 4 - 2 = 34 → 50 chars = 2 rows
    assert.equal(lines.length, 4);
  });

  test('cursorPosition maps buffer cursor to block coordinates', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('hello\nwo');
    const pos = block.cursorPosition(40);
    // row 0 is the top border; buffer row 1 → block row 2
    assert.deepEqual(pos, { row: 2, col: 2 + 2 + 2 });
  });

  test('cursor at wrap boundary lands on next visual row', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('a'.repeat(34)); // exactly one full row at width 40
    const pos = block.cursorPosition(40);
    assert.deepEqual(pos, { row: 2, col: 4 });
  });

  test('narrow terminal drops borders', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('hi');
    const lines = block.render(30).map(stripAnsi);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^› hi$/);
  });
});
