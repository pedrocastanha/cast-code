import { Injectable, Optional } from '@nestjs/common';
import { LlmClientFactory } from '../../../common/services/llm-client.factory';
import { extractText } from '../../../common/types/llm.types';
import {
  BenchmarkBudget,
  BenchmarkCase,
  BenchmarkToolTraceEntry,
  GraderDefinition,
  GraderScore,
} from '../types';
import { BenchmarkCostService } from './benchmark-cost.service';

@Injectable()
export class BenchmarkGraderService {
  constructor(
    @Optional()
    private readonly llmClientFactory?: LlmClientFactory,
    private readonly costService: BenchmarkCostService = new BenchmarkCostService(),
  ) {}

  async grade(input: {
    benchmarkCase: BenchmarkCase;
    output: string;
    graders: GraderDefinition[];
    toolTrace?: BenchmarkToolTraceEntry[];
    budget?: BenchmarkBudget;
    usedLlmJudgeCalls?: number;
  }): Promise<GraderScore[]> {
    const scores: GraderScore[] = [];
    let usedJudgeCalls = input.usedLlmJudgeCalls ?? 0;

    for (const grader of input.graders) {
      if (grader.type === 'llm_judge') {
        scores.push(await this.gradeLlmJudge(grader, input.benchmarkCase, input.output, input.budget, usedJudgeCalls));
        if (scores.at(-1)?.metadata?.llmJudgeUsed) {
          usedJudgeCalls += 1;
        }
        continue;
      }

      scores.push(this.gradeDeterministic(grader, input.benchmarkCase, input.output, input.toolTrace ?? []));
    }

    return scores;
  }

  private gradeDeterministic(
    grader: GraderDefinition,
    benchmarkCase: BenchmarkCase,
    output: string,
    toolTrace: BenchmarkToolTraceEntry[],
  ): GraderScore {
    try {
      switch (grader.type) {
      case 'string_check':
        return this.gradeStringCheck(grader, benchmarkCase, output);
      case 'regex':
        return this.gradeRegex(grader, output);
      case 'json_schema':
        return this.gradeJsonSchema(grader, output);
      case 'tool_trace':
        return this.gradeToolTrace(grader, toolTrace);
      default:
        return this.fail(grader, `Unsupported grader type: ${grader.type}`);
      }
    } catch (error) {
      return this.fail(grader, error instanceof Error ? error.message : String(error));
    }
  }

  private gradeStringCheck(grader: GraderDefinition, benchmarkCase: BenchmarkCase, output: string): GraderScore {
    const mode = String(grader.config.mode ?? 'contains');
    const expected = String(grader.config.value ?? grader.config.expected ?? benchmarkCase.expected ?? '');
    if (!expected) {
      return this.fail(grader, 'string_check requires config.value or case.expected');
    }

    const caseSensitive = grader.config.caseSensitive === true;
    const actualText = caseSensitive ? output : output.toLowerCase();
    const expectedText = caseSensitive ? expected : expected.toLowerCase();
    const passed = mode === 'equals'
      ? actualText.trim() === expectedText.trim()
      : actualText.includes(expectedText);

    return {
      graderId: grader.id,
      type: grader.type,
      passed,
      score: passed ? 1 : 0,
      reason: passed ? 'matched string_check' : `missing expected text: ${expected}`,
    };
  }

  private gradeRegex(grader: GraderDefinition, output: string): GraderScore {
    const pattern = typeof grader.config.pattern === 'string' ? grader.config.pattern : '';
    if (!pattern) {
      return this.fail(grader, 'regex grader requires config.pattern');
    }

    const flags = typeof grader.config.flags === 'string' ? grader.config.flags : '';
    const regex = new RegExp(pattern, flags);
    const passed = regex.test(output);
    return {
      graderId: grader.id,
      type: grader.type,
      passed,
      score: passed ? 1 : 0,
      reason: passed ? 'matched regex' : `regex did not match: ${pattern}`,
    };
  }

  private gradeJsonSchema(grader: GraderDefinition, output: string): GraderScore {
    const schema = grader.config.schema as any;
    if (!schema || typeof schema !== 'object') {
      return this.fail(grader, 'json_schema grader requires config.schema');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(output);
    } catch {
      return this.fail(grader, 'output is not valid JSON');
    }

    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!(key in parsed)) {
        return this.fail(grader, `missing required JSON property: ${key}`);
      }
    }

    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    for (const [key, propertySchema] of Object.entries(properties) as Array<[string, any]>) {
      if (!(key in parsed) || !propertySchema?.type) {
        continue;
      }
      if (!this.matchesJsonType(parsed[key], propertySchema.type)) {
        return this.fail(grader, `JSON property ${key} is not type ${propertySchema.type}`);
      }
    }

    return {
      graderId: grader.id,
      type: grader.type,
      passed: true,
      score: 1,
      reason: 'JSON schema matched',
    };
  }

  private gradeToolTrace(grader: GraderDefinition, toolTrace: BenchmarkToolTraceEntry[]): GraderScore {
    const expectedTools = Array.isArray(grader.config.expectedTools)
      ? grader.config.expectedTools.map(String)
      : [];
    if (expectedTools.length === 0) {
      return this.fail(grader, 'tool_trace grader requires config.expectedTools');
    }

    const actual = toolTrace.map((entry) => entry.name);
    const ordered = grader.config.ordered !== false;
    const passed = ordered
      ? this.isOrderedSubsequence(expectedTools, actual)
      : expectedTools.every((tool) => actual.includes(tool));

    return {
      graderId: grader.id,
      type: grader.type,
      passed,
      score: passed ? 1 : 0,
      reason: passed ? 'tool trace matched' : `expected tools not observed: ${expectedTools.join(', ')}`,
      metadata: { actualTools: actual },
    };
  }

  private async gradeLlmJudge(
    grader: GraderDefinition,
    benchmarkCase: BenchmarkCase,
    output: string,
    budget?: BenchmarkBudget,
    usedCalls = 0,
  ): Promise<GraderScore> {
    if (!this.costService.canRunLlmJudge(budget, usedCalls)) {
      return this.fail(grader, 'llm_judge skipped because budget does not allow LLM judging');
    }
    if (!this.llmClientFactory) {
      return this.fail(grader, 'llm_judge requires a configured model service');
    }

    try {
      const model = this.llmClientFactory.create('reviewer');
      const response = await model.invoke([
        { role: 'system', content: [
          'You are a strict benchmark judge.',
          'Return only JSON with boolean passed, number score between 0 and 1, and string reason.',
        ].join(' ') },
        { role: 'user', content: JSON.stringify({
          rubric: grader.config.rubric ?? grader.config.prompt ?? 'Judge whether the output satisfies the expected answer.',
          input: benchmarkCase.input,
          expected: benchmarkCase.expected,
          output,
        }) },
      ]);

      const text = extractText(response);
      const parsed = JSON.parse(text);
      const score = Math.max(0, Math.min(1, Number(parsed.score ?? (parsed.passed ? 1 : 0))));
      return {
        graderId: grader.id,
        type: grader.type,
        passed: Boolean(parsed.passed) || score >= Number(grader.config.passScore ?? 0.7),
        score,
        reason: String(parsed.reason ?? 'LLM judge completed'),
        metadata: { llmJudgeUsed: true },
      };
    } catch (error) {
      return this.fail(grader, `llm_judge failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private matchesJsonType(value: unknown, type: string): boolean {
    if (type === 'array') return Array.isArray(value);
    if (type === 'null') return value === null;
    return typeof value === type;
  }

  private isOrderedSubsequence(expected: string[], actual: string[]): boolean {
    let cursor = 0;
    for (const tool of actual) {
      if (tool === expected[cursor]) {
        cursor += 1;
      }
      if (cursor === expected.length) {
        return true;
      }
    }
    return false;
  }

  private fail(grader: GraderDefinition, reason: string): GraderScore {
    return {
      graderId: grader.id,
      type: grader.type,
      passed: false,
      score: 0,
      reason,
    };
  }
}
