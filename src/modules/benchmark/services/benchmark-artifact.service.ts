import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { StateRedactionService } from '../../state/services/state-redaction.service';
import { BenchmarkDefinition, BenchmarkResult, BenchmarkRun } from '../types';

@Injectable()
export class BenchmarkArtifactService {
  constructor(private readonly redaction: StateRedactionService) {}

  async prepareRun(run: BenchmarkRun, definition: BenchmarkDefinition): Promise<{ artifactDir: string; reportPath: string }> {
    const artifactDir = this.getArtifactDir(run.projectRoot, run.id);
    await fs.mkdir(artifactDir, { recursive: true });

    await fs.writeFile(
      path.join(artifactDir, 'config.json'),
      this.redactJson({
        runId: run.id,
        benchmark: definition,
        startedAt: run.startedAt,
      }),
      'utf-8',
    );
    await fs.writeFile(
      path.join(artifactDir, 'cases.jsonl'),
      definition.cases.map((benchmarkCase) => this.redactJsonLine(benchmarkCase)).join('\n') + '\n',
      'utf-8',
    );
    await fs.writeFile(path.join(artifactDir, 'results.jsonl'), '', 'utf-8');

    return {
      artifactDir,
      reportPath: path.join(artifactDir, 'report.md'),
    };
  }

  async appendResult(projectRoot: string, runId: string, result: BenchmarkResult): Promise<void> {
    const artifactDir = this.getArtifactDir(projectRoot, runId);
    await fs.mkdir(artifactDir, { recursive: true });
    await fs.appendFile(
      path.join(artifactDir, 'results.jsonl'),
      this.redactJsonLine(result) + '\n',
      'utf-8',
    );
  }

  async writeReport(
    projectRoot: string,
    run: BenchmarkRun,
    definition: BenchmarkDefinition,
    results: BenchmarkResult[],
  ): Promise<string> {
    const artifactDir = this.getArtifactDir(projectRoot, run.id);
    await fs.mkdir(artifactDir, { recursive: true });
    const reportPath = path.join(artifactDir, 'report.md');
    const summary = run.summary;
    const failed = results.filter((result) => result.status !== 'passed');
    const modelMatrix = definition.models?.length
      ? definition.models.map((model) => `- ${model.provider}/${model.model}`).join('\n')
      : '- default runtime model';

    const lines = [
      '# Benchmark Report',
      '',
      `Benchmark: ${definition.name}`,
      `Run ID: ${run.id}`,
      `Status: ${run.status}`,
      '',
      '## Model Matrix',
      modelMatrix,
      '',
      '## Summary',
      `Total cases: ${summary?.totalCases ?? results.length}`,
      `Passed cases: ${summary?.passedCases ?? results.filter((result) => result.status === 'passed').length}`,
      `Failed cases: ${summary?.failedCases ?? failed.length}`,
      `Pass rate: ${this.formatPercent(summary?.passRate ?? 0)}`,
      `Score: ${this.formatNumber(summary?.score ?? 0)}`,
      `Cost: $${this.formatNumber(summary?.totalCost ?? 0)}`,
      `Tokens: ${summary?.totalTokens ?? results.reduce((sum, result) => sum + result.tokens, 0)}`,
      `Latency p50: ${summary?.latencyP50Ms ?? 0}ms`,
      `Latency p95: ${summary?.latencyP95Ms ?? 0}ms`,
      '',
      '## Failures',
      failed.length
        ? failed.map((result) => `- ${result.caseId}: ${result.error || result.scores.map((score) => score.reason).join('; ')}`).join('\n')
        : '- none',
      '',
      '## Artifact Paths',
      `- config: ${path.join(artifactDir, 'config.json')}`,
      `- cases: ${path.join(artifactDir, 'cases.jsonl')}`,
      `- results: ${path.join(artifactDir, 'results.jsonl')}`,
      `- report: ${reportPath}`,
      '',
    ];

    await fs.writeFile(reportPath, this.redaction.redact(lines.join('\n')), 'utf-8');
    return reportPath;
  }

  getArtifactDir(projectRoot: string, runId: string): string {
    return path.join(projectRoot, '.cast', 'benchmarks', runId);
  }

  getReportPath(projectRoot: string, runId: string): string {
    return path.join(this.getArtifactDir(projectRoot, runId), 'report.md');
  }

  private redactJson(value: unknown): string {
    return this.redaction.redact(JSON.stringify(value, null, 2));
  }

  private redactJsonLine(value: unknown): string {
    return this.redaction.redact(JSON.stringify(value));
  }

  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  private formatNumber(value: number): string {
    if (!Number.isFinite(value)) {
      return '0';
    }
    const formatted = value.toFixed(value % 1 === 0 ? 0 : 4);
    return formatted.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') || '0';
  }
}
