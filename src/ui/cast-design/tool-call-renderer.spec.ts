import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getToolDisplayName, getToolInputSummary, getToolResultSummary } from './tool-call-details';
import { buildToolCallRenderState, renderToolCallBlock } from './tool-call-renderer';
import { stripAnsi } from './cli-renderer';

describe('tool call details', () => {
  test('maps tool names to Claude-style display labels', () => {
    assert.equal(getToolDisplayName('shell'), 'Bash');
    assert.equal(getToolDisplayName('read_file'), 'Read');
    assert.equal(getToolDisplayName('grep'), 'Search');
  });

  test('extracts shell command summaries with dollar prefix', () => {
    assert.equal(
      getToolInputSummary('shell', { command: 'npm test' }),
      '$ npm test',
    );
  });

  test('extracts delegated agent task summaries', () => {
    const summary = getToolInputSummary('task', {
      subagent_type: 'reviewer',
      description: 'Review plan-mode behavior',
    });

    assert.match(summary, /agent reviewer/);
    assert.match(summary, /Review plan-mode behavior/);
  });

  test('summarizes read_file output by line count', () => {
    const summary = getToolResultSummary('read_file', 'line1\nline2\nline3');
    assert.match(summary, /3 lines/);
  });
});

describe('tool call renderer', () => {
  test('renders a running tool block with borders and spinner', () => {
    const state = buildToolCallRenderState({
      type: 'started',
      toolName: 'shell',
      callId: 'tool-1',
      input: { command: 'echo ok' },
    });

    const { content, lineCount } = renderToolCallBlock(state, {
      terminalWidth: 60,
      spinnerFrame: '⠋',
    });
    const plain = stripAnsi(content);

    assert.match(plain, /╭─ Bash/);
    assert.match(plain, /\$ echo ok/);
    assert.match(plain, /Running/);
    assert.match(plain, /╰/);
    assert.ok(lineCount >= 4);
  });

  test('renders a collapsed completed tool block without output body', () => {
    const state = buildToolCallRenderState({
      type: 'completed',
      toolName: 'shell',
      callId: 'tool-1',
      input: { command: 'echo ok' },
      output: 'ok\n',
      durationMs: 120,
    });

    const { content } = renderToolCallBlock(state, { terminalWidth: 60 });
    const plain = stripAnsi(content);

    assert.match(plain, /✓/);
    assert.match(plain, /120ms/);
    assert.doesNotMatch(plain, /^│ ok/m);
  });

  test('renders an expanded completed tool block with output lines', () => {
    const state = buildToolCallRenderState({
      type: 'completed',
      toolName: 'shell',
      callId: 'tool-1',
      input: { command: 'echo ok' },
      output: 'line1\nline2\n',
      durationMs: 500,
    });
    state.expanded = true;

    const { content, lineCount } = renderToolCallBlock(state, { terminalWidth: 60 });
    const plain = stripAnsi(content);

    assert.match(plain, /line1/);
    assert.match(plain, /line2/);
    assert.ok(lineCount >= 5);
  });

  test('renders failed tool blocks with error status', () => {
    const state = buildToolCallRenderState({
      type: 'failed',
      toolName: 'shell',
      callId: 'tool-1',
      input: { command: 'false' },
      message: 'exit code 1',
      durationMs: 40,
    });

    const { content } = renderToolCallBlock(state, { terminalWidth: 60 });
    const plain = stripAnsi(content);

    assert.match(plain, /✗/);
    assert.match(plain, /exit code 1/);
  });
});
