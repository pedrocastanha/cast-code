import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import {
  BenchmarkCase,
  BenchmarkDefinition,
  BenchmarkTargetType,
  GraderDefinition,
} from '../types';

@Injectable()
export class BenchmarkDefinitionService {
  createQuickDefinition(input: {
    projectRoot: string;
    task: string;
    expectedQuality: string;
    targetType?: BenchmarkTargetType;
  }): BenchmarkDefinition {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const caseId = crypto.randomUUID();
    const expected = input.expectedQuality.trim();
    const graders: GraderDefinition[] = expected
      ? [{ id: 'expected-quality', type: 'string_check', config: { mode: 'contains', value: expected } }]
      : [];
    const cases: BenchmarkCase[] = [
      {
        id: caseId,
        input: input.task.trim() || 'Respond with a concise Cast benchmark smoke answer.',
        expected: expected || undefined,
      },
    ];

    return {
      id: `quick-${timestamp}`,
      projectRoot: input.projectRoot,
      name: `quick-${timestamp}`,
      description: 'Quick local benchmark generated from the CLI.',
      target: {
        type: input.targetType ?? 'agent_workflow',
        config: { prompt: '{{input}}' },
      },
      cases,
      graders,
      budget: { maxCases: 3, maxCostUsd: 1, maxTokens: 20_000, allowLlmJudge: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  validateDefinition(definition: BenchmarkDefinition): BenchmarkDefinition {
    if (!definition.id) {
      throw new Error('Benchmark definition requires id.');
    }
    if (!definition.projectRoot) {
      throw new Error('Benchmark definition requires projectRoot.');
    }
    if (!definition.name) {
      throw new Error('Benchmark definition requires name.');
    }
    if (!definition.target?.type) {
      throw new Error('Benchmark definition requires target.type.');
    }
    if (!Array.isArray(definition.cases) || definition.cases.length === 0) {
      throw new Error('Benchmark definition requires at least one case.');
    }
    return definition;
  }
}
