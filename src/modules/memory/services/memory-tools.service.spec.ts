import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MemoryToolsService } from './memory-tools.service';

describe('MemoryToolsService rag_search', () => {
  test('returns platform memory results when RAG is enabled', async () => {
    const marked: Array<{ retrievalId: string; unitIds: string[] }> = [];
    const service = new MemoryToolsService({} as any, {
      isRagEnabled: () => true,
      retrieveMemory: async (query: string, topK?: number) => ({
        retrievalId: 'ret-1',
        latencyMs: 35,
        results: [{
          unitId: '11111111-1111-4111-8111-111111111111',
          sourceId: 'doc-1',
          content: `Answer for ${query}`,
          score: 0.91,
          related: topK ? [{ unitId: '22222222-2222-4222-8222-222222222222', content: 'Related context' }] : [],
        }],
      }),
      markMemoryUsed: async (retrievalId: string, unitIds: string[]) => {
        marked.push({ retrievalId, unitIds });
        return { accepted: unitIds.length };
      },
    } as any);
    const tool = service.getTools().find((item) => item.name === 'rag_search');

    const output = await tool!.invoke({ query: 'auth', topK: 2 });

    assert.match(String(output), /retrieval=ret-1/);
    assert.match(String(output), /latency=35ms/);
    assert.match(String(output), /11111111/);
    assert.match(String(output), /Answer for auth/);
    assert.match(String(output), /Related context/);
    assert.deepEqual(marked, [{
      retrievalId: 'ret-1',
      unitIds: ['11111111-1111-4111-8111-111111111111'],
    }]);
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
