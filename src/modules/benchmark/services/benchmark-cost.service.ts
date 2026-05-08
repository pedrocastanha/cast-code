import { Injectable } from '@nestjs/common';
import { BenchmarkBudget, BenchmarkResult, BenchmarkSummary } from '../types';

@Injectable()
export class BenchmarkCostService {
  assertWithinBudget(input: {
    budget?: BenchmarkBudget;
    completedCases: number;
    totalCost: number;
    totalTokens: number;
    llmJudgeCalls?: number;
  }): void {
    const budget = input.budget;
    if (!budget) {
      return;
    }

    if (budget.maxCases !== undefined && input.completedCases >= budget.maxCases) {
      throw new Error(`Benchmark budget exceeded: maxCases=${budget.maxCases}`);
    }
    if (budget.maxCostUsd !== undefined && input.totalCost >= budget.maxCostUsd) {
      throw new Error(`Benchmark budget exceeded: maxCostUsd=${budget.maxCostUsd}`);
    }
    if (budget.maxTokens !== undefined && input.totalTokens >= budget.maxTokens) {
      throw new Error(`Benchmark budget exceeded: maxTokens=${budget.maxTokens}`);
    }
  }

  canRunLlmJudge(budget?: BenchmarkBudget, usedCalls = 0): boolean {
    if (!budget?.allowLlmJudge) {
      return false;
    }
    if (budget.maxLlmJudgeCalls !== undefined && usedCalls >= budget.maxLlmJudgeCalls) {
      return false;
    }
    return true;
  }

  aggregateSummary(results: BenchmarkResult[]): BenchmarkSummary {
    const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
    const totalCases = results.length;
    const passedCases = results.filter((result) => result.status === 'passed').length;
    const failedCases = totalCases - passedCases;
    const score = totalCases === 0
      ? 0
      : results.reduce((sum, result) => sum + result.score, 0) / totalCases;

    return {
      totalCases,
      passedCases,
      failedCases,
      passRate: totalCases === 0 ? 0 : passedCases / totalCases,
      score,
      totalCost: results.reduce((sum, result) => sum + result.cost, 0),
      totalTokens: results.reduce((sum, result) => sum + result.tokens, 0),
      latencyP50Ms: this.percentile(latencies, 0.5),
      latencyP95Ms: this.percentile(latencies, 0.95),
    };
  }

  estimateTokens(text: string): number {
    return text ? Math.max(1, Math.ceil(text.length / 4)) : 0;
  }

  private percentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) {
      return 0;
    }
    const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentile) - 1);
    return sortedValues[index];
  }
}
