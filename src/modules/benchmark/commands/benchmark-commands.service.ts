import { Injectable, Optional } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  BenchmarkAgentExecutor,
  BenchmarkDefinition,
  BenchmarkHarnessPlan,
  BenchmarkTargetCandidate,
} from '../types';
import { BenchmarkDefinitionService } from '../services/benchmark-definition.service';
import { BenchmarkExplicitTargetService } from '../services/benchmark-explicit-target.service';
import { BenchmarkHarnessPlannerService } from '../services/benchmark-harness-planner.service';
import { BenchmarkModelLocatorService } from '../services/benchmark-model-locator.service';
import { BenchmarkPlatformSyncService } from '../services/benchmark-platform-sync.service';
import { BenchmarkRouteDiscoveryService } from '../services/benchmark-route-discovery.service';
import { BenchmarkRunnerService } from '../services/benchmark-runner.service';
import { BenchmarkSandboxDecisionService } from '../services/benchmark-sandbox-decision.service';
import { BenchmarkStoreService } from '../services/benchmark-store.service';
import { BenchmarkTargetService } from '../services/benchmark-target.service';

type SmartInputLike = {
  question?: (message: string) => Promise<string>;
  askChoice?: (message: string, choices: Array<{ key: string; label: string; description?: string }>) => Promise<string>;
};

@Injectable()
export class BenchmarkCommandsService {
  constructor(
    private readonly store: BenchmarkStoreService,
    private readonly definitions: BenchmarkDefinitionService,
    private readonly runner: BenchmarkRunnerService,
    private readonly targets: BenchmarkTargetService,
    private readonly explicitTargets: BenchmarkExplicitTargetService,
    private readonly routeDiscovery: BenchmarkRouteDiscoveryService,
    private readonly harnessPlanner: BenchmarkHarnessPlannerService,
    private readonly modelLocator: BenchmarkModelLocatorService,
    private readonly sandboxDecision: BenchmarkSandboxDecisionService,
    @Optional()
    private readonly platformSync?: BenchmarkPlatformSyncService,
  ) {}

  setAgentExecutor(executor: BenchmarkAgentExecutor): void {
    this.targets.setAgentExecutor(executor);
  }

  async cmdBenchmark(args: string[], smartInput?: SmartInputLike): Promise<void> {
    const subcommand = (args[0] ?? 'help').toLowerCase();

    if (args.some((arg) => arg.startsWith('@'))) {
      await this.explicitTarget(args, smartInput);
      return;
    }

    if (args.length === 0 || subcommand === 'discover') {
      await this.discover(smartInput);
      return;
    }

    switch (subcommand) {
    case 'list':
      await this.list();
      return;
    case 'quick':
      await this.quick(smartInput);
      return;
    case 'run':
      await this.run(args[1], this.sandboxConfig(args));
      return;
    case 'open':
      await this.open(args[1]);
      return;
    case 'export':
      await this.export(args[1], this.getFormat(args));
      return;
    case 'help':
    default:
      this.printHelp();
    }
  }

  private async list(): Promise<void> {
    const definitions = await this.store.listDefinitions(process.cwd());
    const runs = await this.store.listRuns(process.cwd());

    if (definitions.length === 0) {
      process.stdout.write('No local benchmarks found. Run /benchmark quick to create one.\n');
      return;
    }

    process.stdout.write('Local benchmarks:\n');
    for (const definition of definitions) {
      const latestRun = runs.find((run) => run.definitionId === definition.id);
      const suffix = latestRun ? ` latest=${latestRun.status} ${latestRun.id}` : ' no runs yet';
      process.stdout.write(`- ${definition.id} ${definition.name} (${definition.cases.length} cases)${suffix}\n`);
    }
  }

  private async quick(smartInput?: SmartInputLike): Promise<void> {
    const task = await this.ask(
      smartInput,
      'Task example for this benchmark',
      'Respond with expected-quality for a Cast benchmark smoke test.',
    );
    const expectedQuality = await this.ask(
      smartInput,
      'Expected quality or phrase',
      'expected-quality',
    );

    if (smartInput?.askChoice) {
      const choice = await smartInput.askChoice('Run benchmark now?', [
        { key: 'y', label: 'Yes', description: 'create and run quick benchmark' },
        { key: 'n', label: 'No', description: 'cancel' },
      ]);
      if (choice !== 'y') {
        process.stdout.write('Benchmark quick cancelled.\n');
        return;
      }
    }

    const definition = this.definitions.createQuickDefinition({
      projectRoot: process.cwd(),
      task,
      expectedQuality,
    });

    await this.store.saveDefinition(definition);
    await this.syncDefinition(definition);
    const run = await this.runner.runDefinition(definition);
    await this.syncRun(definition, run);
    this.printRunCompleted(run);
  }

  private async explicitTarget(args: string[], smartInput?: SmartInputLike): Promise<void> {
    const result = await this.explicitTargets.resolve(args, process.cwd());
    if (!result || result.candidates.length === 0) {
      process.stdout.write('No benchmark target found in explicit path.\n');
      return;
    }

    const candidate = result.candidates[0];
    const definition = await this.prepareDefinitionFromCandidate(candidate, {
      smartInput,
      expected: result.expected,
    });
    if (!definition) {
      return;
    }

    const saved = await this.store.saveDefinition(definition);
    await this.maybeRunCreatedDefinition(saved, smartInput);
  }

  private async discover(smartInput?: SmartInputLike): Promise<void> {
    const candidates = await this.routeDiscovery.discoverProject(process.cwd());
    if (candidates.length === 0) {
      process.stdout.write('No benchmarkable targets found. Try /benchmark quick or /benchmark @path/to/router.ts POST /route.\n');
      return;
    }

    const visibleCandidates = candidates.slice(0, 8);
    const selected = smartInput?.askChoice
      ? await smartInput.askChoice('Benchmark target', visibleCandidates.map((candidate, index) => ({
        key: String(index),
        label: candidate.label,
        description: `${candidate.type} ${candidate.filePath ?? ''}`,
      })))
      : undefined;

    if (selected === undefined) {
      process.stdout.write('Discovered benchmarkable targets:\n');
      for (const [index, candidate] of visibleCandidates.entries()) {
        process.stdout.write(`${index + 1}. ${candidate.label} - ${candidate.filePath ?? 'unknown'} - confidence ${candidate.confidence.toFixed(2)}\n`);
      }
      process.stdout.write('Run /benchmark @path/to/file.ts METHOD /route to benchmark one directly.\n');
      return;
    }

    const candidate = visibleCandidates[Number(selected)];
    if (!candidate) {
      process.stdout.write('Benchmark discovery cancelled.\n');
      return;
    }

    const definition = await this.prepareDefinitionFromCandidate(candidate, { smartInput });
    if (!definition) {
      return;
    }

    const saved = await this.store.saveDefinition(definition);
    await this.maybeRunCreatedDefinition(saved, smartInput);
  }

  private async prepareDefinitionFromCandidate(
    candidate: BenchmarkTargetCandidate,
    options: { smartInput?: SmartInputLike; expected?: string },
  ): Promise<BenchmarkDefinition | null> {
    const content = candidate.filePath ? await fs.readFile(candidate.filePath, 'utf-8').catch(() => '') : '';
    const overridePoints = await this.modelLocator.locate({
      projectRoot: process.cwd(),
      filePath: candidate.filePath,
      content,
    });
    let target = {
      type: candidate.target.type,
      config: { ...candidate.target.config },
    };
    let plan = this.harnessPlanner.plan({ ...candidate, target }, overridePoints);

    if (plan.requiresWrite) {
      const decision = options.smartInput?.askChoice
        ? await options.smartInput.askChoice(
          'This target needs a wrapper before benchmarking. Where should Cast create it?',
          this.sandboxDecision.writeConfirmationChoices(),
        )
        : 'cancel';
      if (decision === 'cancel') {
        process.stdout.write('Benchmark setup cancelled before writing files.\n');
        return null;
      }
      process.stdout.write(`Benchmark wrapper strategy selected: ${decision}\n`);
    }

    if (candidate.type !== 'api_endpoint') {
      process.stdout.write(`Discovered ${candidate.type}, but only api_endpoint can run in Plan 02.5.\n`);
      return null;
    }

    if (!target.config.url) {
      const baseUrl = await this.ask(options.smartInput, `Base URL for ${candidate.label}`, 'http://localhost:3000');
      target = {
        ...target,
        config: {
          ...target.config,
          url: this.joinUrl(baseUrl, candidate.routePath ?? '/'),
        },
      };
      plan = this.harnessPlanner.plan({ ...candidate, target }, overridePoints);
    }

    this.printHarnessPlan(plan);
    const task = await this.ask(options.smartInput, 'Example input for this benchmark', 'hello benchmark');
    const expected = options.expected ?? await this.ask(options.smartInput, 'Expected quality or phrase', 'expected-quality');
    const now = new Date().toISOString();

    return {
      id: `discovered-${Date.now()}`,
      projectRoot: process.cwd(),
      name: `Benchmark ${candidate.label}`,
      description: `Discovered from ${candidate.filePath ?? candidate.source}`,
      target,
      cases: [{
        id: 'case-1',
        input: task,
        expected,
        metadata: {
          discoveredTarget: {
            candidateId: candidate.id,
            source: candidate.source,
            filePath: candidate.filePath,
            method: candidate.method,
            routePath: candidate.routePath,
            harnessMode: plan.mode,
          },
        },
      }],
      graders: [{
        id: 'expected-quality',
        type: 'string_check',
        config: { value: expected, caseSensitive: false },
      }],
      budget: { maxCases: 1, allowLlmJudge: false },
      tags: ['discovered'],
      createdAt: now,
      updatedAt: now,
    };
  }

  private async maybeRunCreatedDefinition(definition: BenchmarkDefinition, smartInput?: SmartInputLike): Promise<void> {
    const choice = smartInput?.askChoice
      ? await smartInput.askChoice('Run benchmark now?', [
        { key: 'y', label: 'Yes', description: 'run the discovered benchmark now' },
        { key: 'n', label: 'No', description: 'save definition only' },
      ])
      : 'n';
    if (choice !== 'y') {
      process.stdout.write(`Benchmark saved: ${definition.id}\n`);
      return;
    }

    const validated = this.definitions.validateDefinition(definition);
    await this.syncDefinition(validated);
    const run = await this.runner.runDefinition(validated);
    await this.syncRun(validated, run);
    this.printRunCompleted(run);
  }

  private async run(id?: string, sandbox?: BenchmarkDefinition['sandbox']): Promise<void> {
    if (!id) {
      process.stdout.write('Usage: /benchmark run {definitionId}\n');
      return;
    }

    const definition = await this.store.getDefinition(id);
    if (!definition) {
      process.stdout.write(`Benchmark definition not found: ${id}\n`);
      return;
    }

    const validated = this.definitions.validateDefinition({
      ...definition,
      sandbox: sandbox ?? definition.sandbox,
    });
    await this.syncDefinition(validated);
    const run = await this.runner.runDefinition(validated);
    await this.syncRun(validated, run);
    this.printRunCompleted(run);
  }

  private async open(runId?: string): Promise<void> {
    if (!runId) {
      process.stdout.write('Usage: /benchmark open {runId}\n');
      return;
    }

    const run = await this.store.getRun(runId);
    if (!run) {
      process.stdout.write(`Benchmark run not found: ${runId}\n`);
      return;
    }

    const reportPath = run.artifactDir
      ? path.join(run.artifactDir, 'report.md')
      : path.join(process.cwd(), '.cast', 'benchmarks', run.id, 'report.md');
    const webUrl = await this.platformSync?.getWebRunUrl(run.projectRoot, run.id);
    if (webUrl) {
      process.stdout.write(`Benchmark platform: ${webUrl}\n`);
      return;
    }
    process.stdout.write(`Benchmark report: ${path.relative(process.cwd(), reportPath)}\n`);
    process.stdout.write('Platform view unavailable; showing local report path.\n');
  }

  private async export(runId?: string, format = 'markdown'): Promise<void> {
    if (!runId) {
      process.stdout.write('Usage: /benchmark export {runId} --format markdown\n');
      return;
    }
    if (format !== 'markdown') {
      process.stdout.write(`Unsupported export format: ${format}. Only markdown is available in Plan 02.\n`);
      return;
    }

    const run = await this.store.getRun(runId);
    if (!run) {
      process.stdout.write(`Benchmark run not found: ${runId}\n`);
      return;
    }

    const reportPath = path.join(run.artifactDir ?? path.join(process.cwd(), '.cast', 'benchmarks', run.id), 'report.md');
    const markdown = await fs.readFile(reportPath, 'utf-8');
    process.stdout.write(markdown.endsWith('\n') ? markdown : `${markdown}\n`);
  }

  private printHelp(): void {
    process.stdout.write([
      'Benchmark commands:',
      '- /benchmark',
      '- /benchmark discover',
      '- /benchmark quick',
      '- /benchmark list',
      '- /benchmark run {definitionId}',
      '- /benchmark run {definitionId} --sandbox snapshot|git-worktree|docker|none',
      '- /benchmark open {runId}',
      '- /benchmark export {runId} --format markdown',
      '- /benchmark @path/to/router.ts POST /route --base-url http://localhost:3000',
      '',
    ].join('\n'));
  }

  private async ask(smartInput: SmartInputLike | undefined, question: string, fallback: string): Promise<string> {
    if (!smartInput?.question) {
      return fallback;
    }
    const answer = await smartInput.question(question);
    return answer.trim() || fallback;
  }

  private getFormat(args: string[]): string {
    const index = args.indexOf('--format');
    return index >= 0 ? args[index + 1] ?? 'markdown' : 'markdown';
  }

  private sandboxConfig(args: string[]): BenchmarkDefinition['sandbox'] | undefined {
    const mode = this.flag(args, '--sandbox');
    if (mode === 'none' || mode === 'snapshot' || mode === 'git-worktree' || mode === 'docker') {
      return {
        mode,
        rollbackOnFailure: this.flag(args, '--rollback-on-failure') === 'true',
        allowNetwork: this.flag(args, '--allow-network') === 'true',
      };
    }
    return undefined;
  }

  private flag(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  }

  private async syncDefinition(definition: BenchmarkDefinition): Promise<void> {
    const result = await this.platformSync?.syncDefinition(definition);
    this.printSyncResult(result);
  }

  private async syncRun(definition: BenchmarkDefinition, run: Awaited<ReturnType<BenchmarkRunnerService['runDefinition']>>): Promise<void> {
    const result = await this.platformSync?.syncCompletedRun(definition, run);
    this.printSyncResult(result);
    if (result?.webUrl) {
      process.stdout.write(`Benchmark platform: ${result.webUrl}\n`);
    }
  }

  private printSyncResult(result: Awaited<ReturnType<BenchmarkPlatformSyncService['syncDefinition']>> | undefined): void {
    if (!result || result.status === 'synced' || result.status === 'skipped') {
      return;
    }
    process.stdout.write(`[platform] Benchmark sync queued: ${result.message ?? 'platform unavailable'}\n`);
  }

  private printRunCompleted(run: Awaited<ReturnType<BenchmarkRunnerService['runDefinition']>>): void {
    process.stdout.write(`Benchmark completed: ${run.status} ${run.id}\n`);
    process.stdout.write(`Benchmark report: ${path.relative(process.cwd(), path.join(run.artifactDir ?? '', 'report.md'))}\n`);
  }

  private printHarnessPlan(plan: BenchmarkHarnessPlan): void {
    process.stdout.write(`Harness: ${plan.mode} (${plan.reason})\n`);
    process.stdout.write(`Write needed: ${plan.requiresWrite ? 'yes' : 'no'}\n`);
    if (plan.modelOverridePoints.length > 0) {
      process.stdout.write('Model override candidates:\n');
      for (const point of plan.modelOverridePoints.slice(0, 3)) {
        process.stdout.write(`- ${point.label}: ${point.instructions}\n`);
      }
    }
  }

  private joinUrl(baseUrl: string, routePath: string): string {
    return `${baseUrl.replace(/\/+$/g, '')}/${routePath.replace(/^\/+/g, '')}`;
  }
}
