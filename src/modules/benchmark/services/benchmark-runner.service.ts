import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import {
  BenchmarkDefinition,
  BenchmarkResult,
  BenchmarkRun,
  GraderDefinition,
} from '../types';
import { BenchmarkArtifactService } from './benchmark-artifact.service';
import { BenchmarkCostService } from './benchmark-cost.service';
import { BenchmarkGraderService } from './benchmark-grader.service';
import { BenchmarkStoreService } from './benchmark-store.service';
import { BenchmarkTargetService } from './benchmark-target.service';

@Injectable()
export class BenchmarkRunnerService {
  constructor(
    private readonly store: BenchmarkStoreService,
    private readonly artifacts: BenchmarkArtifactService,
    private readonly graders: BenchmarkGraderService,
    private readonly costs: BenchmarkCostService,
    private readonly targets: BenchmarkTargetService,
  ) {}

  async runDefinition(definition: BenchmarkDefinition): Promise<BenchmarkRun> {
    const persistedDefinition = await this.store.saveDefinition(definition);
    let run = await this.store.createRun({
      definitionId: persistedDefinition.id,
      projectRoot: persistedDefinition.projectRoot,
      definitionSnapshot: persistedDefinition,
    });
    const prepared = await this.artifacts.prepareRun(run, persistedDefinition);
    await this.store.setRunArtifactDir(run.id, prepared.artifactDir);
    run = { ...run, artifactDir: prepared.artifactDir };

    const results: BenchmarkResult[] = [];
    let usedLlmJudgeCalls = 0;
    try {
      await this.store.updateRunStatus(run.id, 'running');
      run = { ...run, status: 'running' };

      for (const benchmarkCase of persistedDefinition.cases) {
        this.costs.assertWithinBudget({
          budget: persistedDefinition.budget,
          completedCases: results.length,
          totalCost: results.reduce((sum, result) => sum + result.cost, 0),
          totalTokens: results.reduce((sum, result) => sum + result.tokens, 0),
        });

        const startedAt = new Date().toISOString();
        const startTime = Date.now();
        let result: BenchmarkResult;
        try {
          const targetResult = await this.targets.execute({
            target: persistedDefinition.target,
            benchmarkCase,
          });
          await this.store.updateRunStatus(run.id, 'scoring');
          const graderDefinitions = this.resolveGraders(persistedDefinition.graders, benchmarkCase.graders);
          const scores = await this.graders.grade({
            benchmarkCase,
            output: targetResult.output,
            graders: graderDefinitions,
            toolTrace: targetResult.toolTrace,
            budget: persistedDefinition.budget,
            usedLlmJudgeCalls,
          });
          usedLlmJudgeCalls += scores.filter((graderScore) => graderScore.metadata?.llmJudgeUsed === true).length;
          const score = scores.length === 0
            ? 1
            : scores.reduce((sum, graderScore) => sum + graderScore.score, 0) / scores.length;
          const passed = scores.every((graderScore) => graderScore.passed);

          result = {
            id: crypto.randomUUID(),
            runId: run.id,
            caseId: benchmarkCase.id,
            status: passed ? 'passed' : 'failed',
            input: benchmarkCase.input,
            output: targetResult.output,
            expected: benchmarkCase.expected,
            scores,
            score,
            cost: targetResult.cost ?? 0,
            tokens: targetResult.tokens ?? this.costs.estimateTokens(benchmarkCase.input + targetResult.output),
            latencyMs: Math.max(0, Date.now() - startTime),
            model: targetResult.model,
            toolTrace: targetResult.toolTrace,
            metadata: targetResult.metadata,
            startedAt,
            completedAt: new Date().toISOString(),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result = {
            id: crypto.randomUUID(),
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'error',
            input: benchmarkCase.input,
            expected: benchmarkCase.expected,
            error: message,
            scores: [],
            score: 0,
            cost: 0,
            tokens: 0,
            latencyMs: Math.max(0, Date.now() - startTime),
            startedAt,
            completedAt: new Date().toISOString(),
          };
        }

        results.push(result);
        await this.store.appendResult(run.id, result);
        await this.artifacts.appendResult(persistedDefinition.projectRoot, run.id, result);
        await this.store.updateRunStatus(run.id, 'running');
      }

      const summary = this.costs.aggregateSummary(results);
      await this.store.completeRun(run.id, summary);
      const completed = {
        ...run,
        status: 'completed' as const,
        completedAt: new Date().toISOString(),
        summary,
      };
      await this.artifacts.writeReport(persistedDefinition.projectRoot, completed, persistedDefinition, results);
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const summary = this.costs.aggregateSummary(results);
      await this.store.failRun(run.id, summary, message);
      const failed = {
        ...run,
        status: 'failed' as const,
        completedAt: new Date().toISOString(),
        summary,
        error: message,
      };
      await this.artifacts.writeReport(persistedDefinition.projectRoot, failed, persistedDefinition, results);
      return failed;
    }
  }

  private resolveGraders(
    definitionGraders: GraderDefinition[],
    caseGraders?: GraderDefinition[],
  ): GraderDefinition[] {
    if (caseGraders && caseGraders.length > 0) {
      return caseGraders;
    }
    return definitionGraders;
  }
}
