import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ToolUiService } from './tool-ui.service';
import { stripAnsi } from '../../../ui/cast-design/cli-renderer';

describe('ToolUiService', () => {
  test('renders start then rewrites to collapsed completion', () => {
    const writes: string[] = [];
    const rewrites: Array<{ lineCount: number; content: string }> = [];
    const service = new ToolUiService({
      write: (text) => writes.push(text),
      rewrite: (lineCount, content) => rewrites.push({ lineCount, content }),
      getTerminalWidth: () => 80,
    });

    service.handle({
      type: 'started',
      toolName: 'shell',
      callId: 'tool-1',
      input: { command: 'echo ok' },
    });
    service.handle({
      type: 'completed',
      toolName: 'shell',
      callId: 'tool-1',
      output: 'ok\n',
      durationMs: 25,
    });

    assert.equal(writes.length, 1);
    assert.equal(rewrites.length, 1);
    assert.ok(rewrites[0].lineCount > 0);
    assert.match(stripAnsi(rewrites[0].content), /✓/);
    assert.doesNotMatch(stripAnsi(rewrites[0].content), /^│ ok/m);
  });

  test('expands the last completed tool output', () => {
    const writes: string[] = [];
    const rewrites: Array<{ lineCount: number; content: string }> = [];
    const service = new ToolUiService({
      write: (text) => writes.push(text),
      rewrite: (lineCount, content) => rewrites.push({ lineCount, content }),
      getTerminalWidth: () => 80,
    });

    service.handle({
      type: 'started',
      toolName: 'shell',
      callId: 'tool-1',
      input: { command: 'echo ok' },
    });
    service.handle({
      type: 'completed',
      toolName: 'shell',
      callId: 'tool-1',
      output: 'hello world\n',
      durationMs: 10,
    });

    assert.equal(service.hasExpandable(), true);
    const expanded = service.expandLast();

    assert.equal(expanded, true);
    assert.equal(service.hasExpandable(), false);
    assert.match(stripAnsi(rewrites[1].content), /hello world/);
  });
});
