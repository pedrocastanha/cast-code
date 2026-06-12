import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AgentTreeBlock } from './agent-tree-block';
import { stripAnsi } from '../cast-design/cli-renderer';

describe('AgentTreeBlock', () => {
  test('spawned agent renders name, task, spinner row', () => {
    const block = new AgentTreeBlock(() => {});
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'architect', task: 'Design auth' });
    const lines = block.render(80).map(stripAnsi);
    assert.match(lines[0], /● architect — Design auth/);
    assert.match(lines[1], /Running/);
  });

  test('progress updates current tool', () => {
    const block = new AgentTreeBlock(() => {});
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'coder', task: 'Implement' });
    block.handle({ type: 'progress', agentId: 'a1', currentTool: 'Edit src/x.ts' });
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.some((l) => l.includes('└ Edit src/x.ts')), true);
  });

  test('completed removes agent and scrolls out summary', () => {
    const scrolled: string[] = [];
    const block = new AgentTreeBlock((s) => scrolled.push(s));
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'reviewer', task: 'Review' });
    block.handle({ type: 'completed', agentId: 'a1', durationMs: 41000, summary: '3 issues found' });
    assert.equal(block.render(80).length, 0);
    assert.match(stripAnsi(scrolled.join('')), /✓ reviewer/);
    assert.match(stripAnsi(scrolled.join('')), /41s/);
    assert.match(stripAnsi(scrolled.join('')), /3 issues found/);
  });

  test('failed scrolls out error line', () => {
    const scrolled: string[] = [];
    const block = new AgentTreeBlock((s) => scrolled.push(s));
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'tester', task: 'Test' });
    block.handle({ type: 'failed', agentId: 'a1', durationMs: 2000, error: 'tool crash\nstack...' });
    assert.equal(block.render(80).length, 0);
    const out = stripAnsi(scrolled.join(''));
    assert.match(out, /✗ tester/);
    assert.match(out, /tool crash/);
    assert.equal(out.includes('stack...'), false);
  });

  test('tokens shown when provided', () => {
    const block = new AgentTreeBlock(() => {});
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'coder', task: 'X' });
    block.handle({ type: 'progress', agentId: 'a1', tokens: 12300 });
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.some((l) => l.includes('12.3k tk')), true);
  });

  test('clearAll empties tree without scrolling out (teardown path)', () => {
    const scrolled: string[] = [];
    const block = new AgentTreeBlock((s) => scrolled.push(s));
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'x', task: 'y' });
    block.clearAll();
    assert.equal(block.render(80).length, 0);
    assert.equal(scrolled.length, 0);
  });

  test('isAnimated true only while agents are running', () => {
    const block = new AgentTreeBlock(() => {});
    assert.equal(block.isAnimated(), false);
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'x', task: 'y' });
    assert.equal(block.isAnimated(), true);
  });
});
