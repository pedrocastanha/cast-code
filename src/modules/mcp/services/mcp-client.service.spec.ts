import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpClientService } from './mcp-client.service';

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('HTTP client stores initialize capabilities and exposes resource and prompt methods', async () => {
  const originalFetch = global.fetch;
  const calls: string[] = [];

  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body.method);

    if (body.method === 'initialize') {
      return jsonResponse(
        {
          result: {
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
          },
        },
        { 'mcp-session-id': 'session-1' },
      );
    }

    if (body.method === 'tools/list') return jsonResponse({ result: { tools: [] } });
    if (body.method === 'resources/list') return jsonResponse({ result: { resources: [{ uri: 'file://demo', name: 'Demo' }] } });
    if (body.method === 'resources/read') return jsonResponse({ result: { contents: [{ uri: body.params.uri, text: 'demo' }] } });
    if (body.method === 'prompts/list') return jsonResponse({ result: { prompts: [{ name: 'brief', description: 'Brief prompt' }] } });
    if (body.method === 'prompts/get') return jsonResponse({ result: { messages: [{ role: 'user', content: { type: 'text', text: body.params.name } }] } });

    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  try {
    const client = new McpClientService();

    assert.equal(await client.connect('demo', { type: 'http', endpoint: 'http://localhost/mcp' }), true);
    assert.deepEqual(client.getCapabilities('demo'), { tools: true, resources: true, prompts: true });
    assert.deepEqual(await client.listResources('demo'), [{ uri: 'file://demo', name: 'Demo' }]);
    assert.deepEqual(await client.readResource('demo', 'file://demo'), { contents: [{ uri: 'file://demo', text: 'demo' }] });
    assert.deepEqual(await client.listPrompts('demo'), [{ name: 'brief', description: 'Brief prompt' }]);
    assert.deepEqual(await client.getPrompt('demo', 'brief'), { messages: [{ role: 'user', content: { type: 'text', text: 'brief' } }] });
    assert.ok(calls.includes('resources/list'));
    assert.ok(calls.includes('prompts/list'));
  } finally {
    global.fetch = originalFetch;
  }
});
