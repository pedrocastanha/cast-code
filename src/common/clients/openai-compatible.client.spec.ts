import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { OpenAICompatibleClient } from './openai-compatible.client';

async function* chunks(values: unknown[]): AsyncGenerator<unknown> {
  for (const value of values) {
    yield value;
  }
}

describe('OpenAICompatibleClient', () => {
  test('invokes chat completions with converted messages and tools', async () => {
    let captured: any;
    const sdk = {
      chat: {
        completions: {
          create: async (params: any) => {
            captured = params;
            return {
              choices: [{
                message: {
                  content: 'done',
                  tool_calls: [{
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'read_file', arguments: '{"path":"src/index.ts"}' },
                  }],
                },
              }],
              usage: {
                prompt_tokens: 12,
                completion_tokens: 4,
                prompt_tokens_details: { cached_tokens: 3 },
              },
            };
          },
        },
      },
    };

    const client = new OpenAICompatibleClient({
      provider: 'openai',
      apiKey: 'test',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-test',
      client: sdk as any,
    });

    const message = await client.invoke(
      [{ role: 'user', content: 'read it' }],
      {
        systemPrompt: 'system',
        tools: [{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }],
        maxTokens: 123,
        temperature: 0.2,
        toolChoice: 'auto',
      },
    );

    assert.deepEqual(captured.messages, [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'read it' },
    ]);
    assert.equal(captured.model, 'gpt-test');
    assert.equal(captured.max_tokens, 123);
    assert.equal(captured.temperature, 0.2);
    assert.equal(captured.tool_choice, 'auto');
    assert.deepEqual(captured.tools, [{
      type: 'function',
      function: { name: 'read_file', description: 'Read', parameters: { type: 'object' } },
    }]);
    assert.equal(message.role, 'assistant');
    assert.equal(message.content, 'done');
    assert.deepEqual(message.toolCalls, [{
      id: 'call_1',
      name: 'read_file',
      arguments: { path: 'src/index.ts' },
    }]);
  });

  test('streams text, tool calls, usage, and stop reason', async () => {
    const sdk = {
      chat: {
        completions: {
          create: async () => chunks([
            { choices: [{ delta: { content: 'hel' }, finish_reason: null }] },
            {
              choices: [{
                delta: {
                  tool_calls: [{
                    index: 0,
                    id: 'call_1',
                    function: { name: 'shell', arguments: '{"command":"npm test"}' },
                  }],
                },
                finish_reason: 'tool_calls',
              }],
            },
            { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } },
          ]),
        },
      },
    };
    const client = new OpenAICompatibleClient({
      provider: 'openai',
      apiKey: 'test',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-test',
      client: sdk as any,
    });

    const events = [];
    for await (const event of client.stream([{ role: 'user', content: 'run tests' }], {})) {
      events.push(event);
    }

    assert.deepEqual(events, [
      { type: 'text_delta', delta: 'hel' },
      { type: 'tool_call', toolCall: { id: 'call_1', name: 'shell', arguments: { command: 'npm test' } } },
      { type: 'stop', reason: 'tool_use' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, cachedInputTokens: 0 } },
    ]);
  });
});
