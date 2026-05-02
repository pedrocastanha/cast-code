import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MemoryToolsService } from './memory-tools.service';

describe('MemoryToolsService rag_search', () => {
  test('returns platform memory results when RAG is enabled', async () => {
    const service = new MemoryToolsService({} as any, {
      isRagEnabled: () => true,
      retrieveMemory: async (query: string, topK?: number) => ({
        results: [{
          unitId: 'unit-1',
          sourceId: 'doc-1',
          content: `Answer for ${query}`,
          score: 0.91,
          related: topK ? [{ unitId: 'unit-2', content: 'Related context' }] : [],
        }],
      }),
    } as any);
    const tool = service.getTools().find((item) => item.name === 'rag_search');

    const output = await tool!.invoke({ query: 'auth', topK: 2 });

    assert.match(String(output), /unit-1/);
    assert.match(String(output), /Answer for auth/);
    assert.match(String(output), /Related context/);
  });

  test('explains when platform RAG is unavailable', async () => {
    const service = new MemoryToolsService({} as any, {
      isRagEnabled: () => false,
      retrieveMemory: async () => ({ results: [] }),
    } as any);
    const tool = service.getTools().find((item) => item.name === 'rag_search');

    const output = await tool!.invoke({ query: 'auth' });

    assert.match(String(output), /not enabled/i);
  });
});
