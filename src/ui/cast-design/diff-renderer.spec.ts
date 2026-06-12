import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderDiffLines } from './diff-renderer';
import { stripAnsi } from './cli-renderer';

describe('renderDiffLines', () => {
  test('shows removed lines with - and added with +', () => {
    const lines = renderDiffLines('a\nb\nc', 'a\nX\nc').map(stripAnsi);
    assert.deepEqual(lines, ['  a', '- b', '+ X', '  c']);
  });

  test('pure addition (write_file on new file)', () => {
    const lines = renderDiffLines('', 'one\ntwo').map(stripAnsi);
    assert.deepEqual(lines, ['+ one', '+ two']);
  });

  test('caps output and reports remainder', () => {
    const oldText = Array.from({ length: 60 }, (_, i) => `l${i}`).join('\n');
    const lines = renderDiffLines(oldText, '', 20).map(stripAnsi);
    assert.equal(lines.length, 21);
    assert.match(lines[20], /… 40 more lines/);
  });

  test('context collapses for large unchanged spans', () => {
    const mid = Array.from({ length: 30 }, (_, i) => `same${i}`).join('\n');
    const lines = renderDiffLines(`start\n${mid}\nend`, `START\n${mid}\nend`).map(stripAnsi);
    assert.equal(lines.some((l) => l.includes('⋮')), true);
    assert.equal(lines.length < 20, true);
  });
});
