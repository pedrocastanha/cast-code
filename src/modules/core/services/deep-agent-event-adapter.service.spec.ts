import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DeepAgentEventAdapterService } from './deep-agent-event-adapter.service';

const collect = async (iterable: AsyncIterable<any>): Promise<any[]> => {
  const items: any[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
};

const asyncItems = async function* <T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
};

describe('DeepAgentEventAdapterService', () => {
  test('maps DeepAgents v2 streamEvents output to canonical runtime events', async () => {
    const requestedVersions: string[] = [];
    const agent = {
      streamEvents: (_payload: unknown, config: { version: string }) => {
        requestedVersions.push(config.version);
        return asyncItems([
          { event: 'on_chat_model_stream', data: { chunk: { content: 'hello' } } },
          { event: 'on_tool_start', name: 'read_file', run_id: 'tool_1', data: { input: { path: 'README.md' } } },
          { event: 'on_tool_end', name: 'read_file', run_id: 'tool_1', data: { output: 'file body' } },
          {
            event: 'on_chat_model_end',
            data: { output: { usage_metadata: { input_tokens: 2, output_tokens: 3 } } },
          },
        ]);
      },
    };

    const adapter = new DeepAgentEventAdapterService();
    const envelopes = await collect(adapter.stream({
      agent,
      payload: { messages: [] },
      recursionLimit: 8,
      scope: { kind: 'main', runId: 'run_1' },
      streamVersion: 'v2',
    }));

    assert.deepEqual(requestedVersions, ['v2']);
    assert.deepEqual(envelopes.map((item) => item.runtimeEvent.type), [
      'runtime.run.started',
      'runtime.message.delta',
      'runtime.tool.started',
      'runtime.tool.completed',
      'runtime.usage',
      'runtime.run.completed',
    ]);
    assert.equal(envelopes[1].sourceVersion, 'v2');
    assert.equal(envelopes[1].rawEvent?.event, 'on_chat_model_stream');
    assert.equal(envelopes[1].runtimeEvent.type, 'runtime.message.delta');
    assert.equal(envelopes[1].runtimeEvent.text, 'hello');
    assert.equal(envelopes[2].runtimeEvent.type, 'runtime.tool.started');
    assert.deepEqual(envelopes[2].runtimeEvent.input, { path: 'README.md' });
    assert.equal(envelopes[3].runtimeEvent.type, 'runtime.tool.completed');
    assert.equal(envelopes[3].runtimeEvent.outputPreview, 'file body');
    assert.equal(envelopes[4].runtimeEvent.type, 'runtime.usage');
    assert.equal(envelopes[4].runtimeEvent.input, 2);
    assert.equal(envelopes[4].runtimeEvent.output, 3);
  });

  test('uses DeepAgents v3 stream projections when auto mode exposes them', async () => {
    const requestedVersions: string[] = [];
    const agent = {
      streamEvents: (_payload: unknown, config: { version: string }) => {
        requestedVersions.push(config.version);
        return {
          messages: asyncItems([{ text: Promise.resolve('hello from v3') }]),
          toolCalls: asyncItems([{
            id: 'tool_1',
            name: 'read_file',
            input: { path: 'README.md' },
            output: Promise.resolve('file body'),
            status: Promise.resolve('success'),
          }]),
          subagents: asyncItems([{
            id: 'sub_1',
            name: 'researcher',
            output: Promise.resolve('done'),
          }]),
        };
      },
    };

    const adapter = new DeepAgentEventAdapterService();
    const envelopes = await collect(adapter.stream({
      agent,
      payload: { messages: [] },
      recursionLimit: 8,
      scope: { kind: 'main', runId: 'run_1' },
      streamVersion: 'auto',
    }));

    assert.deepEqual(requestedVersions, ['v3']);
    assert.deepEqual(envelopes.map((item) => item.runtimeEvent.type), [
      'runtime.run.started',
      'runtime.message.delta',
      'runtime.message.completed',
      'runtime.tool.started',
      'runtime.tool.completed',
      'runtime.subagent.started',
      'runtime.subagent.completed',
      'runtime.run.completed',
    ]);
    assert.equal(envelopes[1].sourceVersion, 'v3');
    assert.equal(envelopes[1].rawEvent, undefined);
    assert.equal(envelopes[1].runtimeEvent.type, 'runtime.message.delta');
    assert.equal(envelopes[1].runtimeEvent.text, 'hello from v3');
    assert.equal(envelopes[4].runtimeEvent.type, 'runtime.tool.completed');
    assert.equal(envelopes[4].runtimeEvent.outputPreview, 'file body');
    assert.equal(envelopes[6].runtimeEvent.type, 'runtime.subagent.completed');
    assert.equal(envelopes[6].runtimeEvent.summary, 'done');
  });

  test('falls back to v2 when auto mode cannot consume v3 projections', async () => {
    const requestedVersions: string[] = [];
    const agent = {
      streamEvents: (_payload: unknown, config: { version: string }) => {
        requestedVersions.push(config.version);
        if (config.version === 'v3') {
          return asyncItems([{ event: 'on_chat_model_stream', data: { chunk: { content: 'not projected' } } }]);
        }
        return asyncItems([{ event: 'on_chat_model_stream', data: { chunk: { content: 'hello from v2' } } }]);
      },
    };

    const adapter = new DeepAgentEventAdapterService();
    const envelopes = await collect(adapter.stream({
      agent,
      payload: { messages: [] },
      recursionLimit: 8,
      scope: { kind: 'main', runId: 'run_1' },
      streamVersion: 'auto',
    }));

    assert.deepEqual(requestedVersions, ['v3', 'v2']);
    assert.equal(envelopes[1].sourceVersion, 'v2');
    assert.equal(envelopes[1].runtimeEvent.type, 'runtime.message.delta');
    assert.equal(envelopes[1].runtimeEvent.text, 'hello from v2');
  });
});
