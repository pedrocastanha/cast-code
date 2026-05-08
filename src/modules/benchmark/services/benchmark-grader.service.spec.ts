import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BenchmarkCostService } from './benchmark-cost.service';
import { BenchmarkGraderService } from './benchmark-grader.service';

describe('BenchmarkGraderService', () => {
  test('grades string contains, equality, regex, json schema, and tool traces', async () => {
    const service = new BenchmarkGraderService(undefined as any, new BenchmarkCostService());

    const scores = await service.grade({
      benchmarkCase: { id: 'case-1', input: 'input', expected: 'hello' },
      output: '{"ok":true,"name":"cast"}',
      graders: [
        { id: 'contains', type: 'string_check', config: { mode: 'contains', value: 'cast' } },
        { id: 'equals', type: 'string_check', config: { mode: 'equals', value: '{"ok":true,"name":"cast"}' } },
        { id: 'regex', type: 'regex', config: { pattern: '"name"\\s*:\\s*"cast"' } },
        { id: 'schema', type: 'json_schema', config: { schema: { required: ['ok', 'name'], properties: { ok: { type: 'boolean' }, name: { type: 'string' } } } } },
        { id: 'tools', type: 'tool_trace', config: { expectedTools: ['read_file', 'write_file'], ordered: true } },
      ],
      toolTrace: [{ name: 'read_file' }, { name: 'write_file' }],
    });

    assert.deepEqual(scores.map((score) => score.passed), [true, true, true, true, true]);
    assert.equal(scores.reduce((sum, score) => sum + score.score, 0), 5);
  });

  test('returns clear failures for invalid grader config', async () => {
    const service = new BenchmarkGraderService(undefined as any, new BenchmarkCostService());

    const scores = await service.grade({
      benchmarkCase: { id: 'case-1', input: 'input' },
      output: 'plain text',
      graders: [
        { id: 'regex', type: 'regex', config: {} },
        { id: 'schema', type: 'json_schema', config: { schema: { required: ['ok'] } } },
      ],
    });

    assert.equal(scores[0].passed, false);
    assert.match(scores[0].reason, /pattern/i);
    assert.equal(scores[1].passed, false);
    assert.match(scores[1].reason, /valid json/i);
  });

  test('keeps llm_judge behind explicit budget permission', async () => {
    let invoked = false;
    const service = new BenchmarkGraderService({
      createModel: () => ({
        invoke: async () => {
          invoked = true;
          return { content: '{"passed":true,"score":1,"reason":"good"}' };
        },
      }),
    } as any, new BenchmarkCostService());

    const skipped = await service.grade({
      benchmarkCase: { id: 'case-1', input: 'input' },
      output: 'answer',
      graders: [{ id: 'judge', type: 'llm_judge', config: { rubric: 'Be good' } }],
      budget: { allowLlmJudge: false, maxLlmJudgeCalls: 1 },
    });

    assert.equal(invoked, false);
    assert.equal(skipped[0].passed, false);
    assert.match(skipped[0].reason, /budget/i);

    const judged = await service.grade({
      benchmarkCase: { id: 'case-1', input: 'input' },
      output: 'answer',
      graders: [{ id: 'judge', type: 'llm_judge', config: { rubric: 'Be good' } }],
      budget: { allowLlmJudge: true, maxLlmJudgeCalls: 1 },
    });

    assert.equal(invoked, true);
    assert.equal(judged[0].passed, true);
    assert.equal(judged[0].score, 1);
  });
});
