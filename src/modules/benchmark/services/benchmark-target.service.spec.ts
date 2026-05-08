import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import { BenchmarkTargetService } from './benchmark-target.service';

describe('BenchmarkTargetService', () => {
  test('executes model_prompt through configured model path', async () => {
    const service = new BenchmarkTargetService({
      createModel: () => ({
        invoke: async (messages: any[]) => ({
          content: `model saw ${messages.at(-1).content}`,
          usage_metadata: { input_tokens: 4, output_tokens: 6 },
        }),
      }),
    } as any);

    const result = await service.execute({
      target: { type: 'model_prompt', config: { prompt: 'Answer: {{input}}' } },
      benchmarkCase: { id: 'case-1', input: 'hello' },
    });

    assert.equal(result.output, 'model saw Answer: hello');
    assert.equal(result.tokens, 10);
  });

  test('executes api_endpoint with case input body', async () => {
    const server = createServer(async (req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ method: req.method, body: JSON.parse(body) }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const service = new BenchmarkTargetService(undefined as any);
      const result = await service.execute({
        target: {
          type: 'api_endpoint',
          config: {
            url: `http://127.0.0.1:${port}/score`,
            method: 'POST',
            body: { prompt: '{{input}}' },
            timeoutMs: 1000,
          },
        },
        benchmarkCase: { id: 'case-1', input: 'hello api' },
      });

      assert.match(result.output, /hello api/);
      assert.match(result.output, /POST/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('executes agent_workflow through registered agent executor', async () => {
    const service = new BenchmarkTargetService(undefined as any);
    service.setAgentExecutor({
      runBenchmarkPrompt: async (prompt: string) => ({
        output: `agent did ${prompt}`,
        tokens: 12,
        cost: 0.03,
        toolTrace: [{ name: 'read_file' }],
      }),
    });

    const result = await service.execute({
      target: { type: 'agent_workflow', config: { prompt: 'Task: {{input}}' } },
      benchmarkCase: { id: 'case-1', input: 'inspect repo' },
    });

    assert.equal(result.output, 'agent did Task: inspect repo');
    assert.equal(result.toolTrace?.[0].name, 'read_file');
  });

  test('disabled future adapters return explicit phase messages', async () => {
    const service = new BenchmarkTargetService(undefined as any);

    await assert.rejects(
      () => service.execute({
        target: { type: 'rag_answer', config: {} },
        benchmarkCase: { id: 'case-1', input: 'question' },
      }),
      /Target type rag_answer requires the RAG benchmark adapter from the platform\/memory integration phase\./,
    );
  });
});
