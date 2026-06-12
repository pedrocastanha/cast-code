import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FooterBlock } from './footer-block';
import { stripAnsi } from '../cast-design/cli-renderer';

describe('FooterBlock', () => {
  test('renders mode, model and hints joined by dots', () => {
    const block = new FooterBlock();
    block.setStatus({ mode: 'plan', model: 'gpt-4.1', hints: ['Ctrl+J newline'] });
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /plan · gpt-4\.1 · Ctrl\+J newline/);
  });

  test('suggestions replace the status line', () => {
    const block = new FooterBlock();
    block.setStatus({ mode: 'auto', model: 'm', hints: [] });
    block.setSuggestions(
      [
        { text: '/help', display: '/help', description: 'Show help' },
        { text: '/up', display: '/up', description: 'Commit' },
      ],
      1,
    );
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /\/help/);
    assert.match(lines[1], /❯.*\/up/);
    block.setSuggestions([], -1);
    assert.equal(block.render(80).map(stripAnsi)[0].includes('auto'), true);
  });

  test('caps visible suggestions at 10 with overflow markers', () => {
    const block = new FooterBlock();
    const many = Array.from({ length: 15 }, (_, i) => ({
      text: `/cmd${i}`,
      display: `/cmd${i}`,
    }));
    block.setSuggestions(many, 12);
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.some((l) => l.includes('above')), true);
    assert.equal(lines.length <= 12, true);
  });
});
