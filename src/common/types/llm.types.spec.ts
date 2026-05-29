import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Message, ToolCallRequest, LlmUsage, ContentPart } from './llm.types';
import {
  isAssistantMessage,
  isToolMessage,
  isUserMessage,
  isSystemMessage,
  extractText,
} from './llm.types';

describe('Message type guards', () => {
  test('identifies system messages', () => {
    const msg: Message = { role: 'system', content: 'You are helpful.' };
    assert.equal(isSystemMessage(msg), true);
    assert.equal(isUserMessage(msg), false);
  });

  test('identifies user messages with string content', () => {
    const msg: Message = { role: 'user', content: 'Hello' };
    assert.equal(isUserMessage(msg), true);
    assert.equal(isSystemMessage(msg), false);
  });

  test('identifies assistant messages', () => {
    const msg: Message = { role: 'assistant', content: 'Hi there' };
    assert.equal(isAssistantMessage(msg), true);
  });

  test('identifies assistant messages with tool calls', () => {
    const msg: Message = {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call_1', name: 'read_file', arguments: { path: 'foo.ts' } }],
    };
    assert.equal(isAssistantMessage(msg), true);
  });

  test('identifies tool result messages', () => {
    const msg: Message = { role: 'tool', toolCallId: 'call_1', toolName: 'read_file', content: 'file contents' };
    assert.equal(isToolMessage(msg), true);
  });
});

describe('extractText', () => {
  test('extracts text from string content', () => {
    assert.equal(extractText({ role: 'user', content: 'hello' }), 'hello');
  });

  test('extracts text from ContentPart array', () => {
    const parts: ContentPart[] = [
      { type: 'text', text: 'hello ' },
      { type: 'text', text: 'world' },
    ];
    assert.equal(extractText({ role: 'user', content: parts }), 'hello world');
  });

  test('ignores non-text parts', () => {
    const parts: ContentPart[] = [
      { type: 'text', text: 'caption' },
      { type: 'image_url', image_url: { url: 'http://img.png' } },
    ];
    assert.equal(extractText({ role: 'user', content: parts }), 'caption');
  });
});

describe('LlmUsage', () => {
  test('has required fields', () => {
    const usage: LlmUsage = { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 };
    assert.equal(usage.inputTokens, 10);
    assert.equal(usage.outputTokens, 5);
    assert.equal(usage.cachedInputTokens, 0);
  });
});

describe('ToolCallRequest', () => {
  test('has id, name, arguments', () => {
    const tc: ToolCallRequest = { id: 'call_abc', name: 'shell', arguments: { command: 'ls' } };
    assert.equal(tc.id, 'call_abc');
    assert.equal(tc.name, 'shell');
    assert.deepEqual(tc.arguments, { command: 'ls' });
  });
});
