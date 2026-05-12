import { Injectable, Optional } from '@nestjs/common';
import type { BenchmarkAgentExecutor } from '../../benchmark/types';
import {
  CreateScheduleInput,
  ScheduleApprovalPolicy,
  ScheduleDefinition,
  ScheduleRun,
} from '../types';
import { ScheduleCronService } from '../services/schedule-cron.service';
import { SchedulePlatformSyncService } from '../services/schedule-platform-sync.service';
import { ScheduleRunnerService } from '../services/schedule-runner.service';
import { ScheduleStoreService } from '../services/schedule-store.service';
import { ScheduleSuggestionService } from '../services/schedule-suggestion.service';

type SmartInputLike = {
  question?: (message: string) => Promise<string>;
  askChoice?: (message: string, choices: Array<{ key: string; label: string; description?: string }>) => Promise<string>;
};

@Injectable()
export class ScheduleCommandsService {
  constructor(
    private readonly store: ScheduleStoreService,
    private readonly runner: ScheduleRunnerService,
    private readonly cron: ScheduleCronService,
    private readonly suggestions: ScheduleSuggestionService,
    @Optional()
    private readonly platformSync?: SchedulePlatformSyncService,
  ) {}

  setAgentExecutor(_executor: BenchmarkAgentExecutor): void {
    // Schedule execution reuses BenchmarkTargetService's agent executor through BenchmarkCommandsService.
  }

  async cmdSchedule(args: string[], smartInput?: SmartInputLike): Promise<void> {
    const subcommand = (args[0] ?? 'list').toLowerCase();
    switch (subcommand) {
    case 'list':
      await this.list();
      return;
    case 'create':
      await this.create(args.slice(1), smartInput);
      return;
    case 'suggest':
      await this.suggest(args.slice(1));
      return;
    case 'run':
      await this.run(args[1]);
      return;
    case 'tick':
      await this.tick();
      return;
    case 'pause':
      await this.status(args[1], 'paused');
      return;
    case 'resume':
      await this.status(args[1], 'active');
      return;
    case 'logs':
      await this.logs(args[1]);
      return;
    case 'help':
    default:
      this.printHelp();
    }
  }

  private async list(): Promise<void> {
    const schedules = await this.store.list(process.cwd());
    if (schedules.length === 0) {
      process.stdout.write('No local schedules found. Run /schedule suggest or /schedule create benchmark <definitionId>.\n');
      return;
    }

    process.stdout.write('Local schedules:\n');
    for (const schedule of schedules) {
      const marker = schedule.status === 'active' ? 'active' : 'paused';
      const next = schedule.nextRunAt ? ` next=${schedule.nextRunAt}` : '';
      process.stdout.write(`- ${schedule.id} ${schedule.name} (${marker}, ${schedule.target.type}, ${this.cron.describe(schedule.cronExpression)})${next}\n`);
    }
  }

  private async suggest(args: string[]): Promise<void> {
    const environmentId = args[0];
    const suggestions = await this.suggestions.list(process.cwd(), environmentId);
    if (suggestions.length === 0) {
      process.stdout.write(environmentId
        ? `No schedule suggestions found for environment: ${environmentId}\n`
        : 'No schedule suggestions found. Run /env list to inspect environments.\n');
      return;
    }

    process.stdout.write('Suggested schedules:\n');
    for (const suggestion of suggestions) {
      process.stdout.write(`- ${suggestion.id} (${suggestion.environmentId}) ${suggestion.name} - ${this.cron.describe(suggestion.cronExpression)}\n`);
      process.stdout.write(`  ${suggestion.description}\n`);
    }
    process.stdout.write('\nCreate one with /schedule create suggested <suggestion-id> [environment-id]\n');
  }

  private async create(args: string[], smartInput?: SmartInputLike): Promise<void> {
    const type = (args[0] ?? 'benchmark').toLowerCase();
    let input: CreateScheduleInput | null = null;

    if (type === 'suggested') {
      input = await this.createSuggested(args);
    } else if (type === 'benchmark') {
      input = await this.createBenchmark(args, smartInput);
    } else if (type === 'environment_task') {
      input = await this.createEnvironmentTask(args, smartInput);
    } else if (type === 'agent_prompt' || type === 'report') {
      input = await this.createAgentPrompt(type, args, smartInput);
    } else {
      process.stdout.write('Usage: /schedule create benchmark <definitionId> [--cron "0 * * * *"] or /schedule create suggested <id> [environment-id]\n');
      return;
    }

    if (!input) {
      return;
    }

    const schedule = await this.store.save(input);
    const syncResult = await this.platformSync?.syncDefinition(schedule);
    process.stdout.write(`Schedule created: ${schedule.id} ${schedule.name}\n`);
    this.printSyncResult(syncResult);
  }

  private async createSuggested(args: string[]): Promise<CreateScheduleInput | null> {
    const suggestionId = args[1];
    const environmentId = args[2];
    if (!suggestionId) {
      process.stdout.write('Usage: /schedule create suggested <suggestion-id> [environment-id]\n');
      return null;
    }
    const suggestion = await this.suggestions.get(process.cwd(), suggestionId, environmentId);
    if (!suggestion) {
      process.stdout.write(`Schedule suggestion not found: ${suggestionId}\n`);
      return null;
    }
    return this.suggestions.toCreateInput(suggestion, process.cwd());
  }

  private async createBenchmark(args: string[], smartInput?: SmartInputLike): Promise<CreateScheduleInput | null> {
    const definitionId = args[1] ?? await this.ask(smartInput, 'Benchmark definition id', '');
    if (!definitionId) {
      process.stdout.write('Usage: /schedule create benchmark <definitionId> [--cron "0 * * * *"]\n');
      return null;
    }

    const cronExpression = this.flag(args, '--cron') ?? await this.ask(smartInput, 'Cron expression', '0 * * * *');
    const name = this.flag(args, '--name') ?? await this.ask(smartInput, 'Schedule name', `Benchmark ${definitionId}`);
    const environmentId = this.flag(args, '--env');
    const approvalPolicy = this.approvalPolicy(this.flag(args, '--approval') ?? 'dry-run-only');
    const maxCostUsd = this.numberFlag(args, '--max-cost');
    const maxTokens = this.numberFlag(args, '--max-tokens');
    const maxRuntimeMs = this.numberFlag(args, '--max-runtime-ms') ?? 300_000;

    return {
      projectRoot: process.cwd(),
      name,
      cronExpression,
      target: {
        type: 'benchmark',
        ref: definitionId,
        config: { definitionId },
      },
      environmentId,
      approvalPolicy,
      sandbox: this.sandboxConfig(args),
      budget: {
        maxCases: this.numberFlag(args, '--max-cases') ?? 25,
        maxCostUsd: maxCostUsd ?? 1,
        maxTokens: maxTokens ?? 100_000,
        allowLlmJudge: this.flag(args, '--allow-llm-judge') === 'true',
      },
      maxRuntimeMs,
      tags: ['benchmark'],
    };
  }

  private async createEnvironmentTask(args: string[], smartInput?: SmartInputLike): Promise<CreateScheduleInput | null> {
    const environmentId = this.flag(args, '--env') ?? args[1] ?? await this.ask(smartInput, 'Environment id', 'active');
    const task = this.flag(args, '--task') ?? await this.ask(smartInput, 'Scheduled task', 'Run environment health review');
    const cronExpression = this.flag(args, '--cron') ?? await this.ask(smartInput, 'Cron expression', '0 9 * * 1');
    const name = this.flag(args, '--name') ?? await this.ask(smartInput, 'Schedule name', `${environmentId} scheduled task`);
    const approvalPolicy = this.approvalPolicy(this.flag(args, '--approval') ?? 'dry-run-only');

    return {
      projectRoot: process.cwd(),
      name,
      cronExpression,
      target: {
        type: 'environment_task',
        ref: task,
        config: {
          task,
          input: this.flag(args, '--input') ?? task,
          expected: this.flag(args, '--expected'),
          dryRun: approvalPolicy === 'dry-run-only',
        },
      },
      environmentId: environmentId === 'active' ? undefined : environmentId,
      approvalPolicy,
      sandbox: this.sandboxConfig(args),
      budget: {
        maxCases: 1,
        maxCostUsd: this.numberFlag(args, '--max-cost') ?? 0.5,
        maxTokens: this.numberFlag(args, '--max-tokens') ?? 20_000,
        allowLlmJudge: false,
      },
      maxRuntimeMs: this.numberFlag(args, '--max-runtime-ms') ?? 600_000,
      tags: ['environment_task', environmentId],
    };
  }

  private async createAgentPrompt(type: 'agent_prompt' | 'report', args: string[], smartInput?: SmartInputLike): Promise<CreateScheduleInput | null> {
    const positional = args.slice(1);
    const flagIndex = positional.findIndex((arg) => arg.startsWith('--'));
    const inlinePrompt = (flagIndex >= 0 ? positional.slice(0, flagIndex) : positional).join(' ').trim();
    const prompt = this.flag(args, '--prompt')
      ?? (inlinePrompt || await this.ask(smartInput, 'Scheduled prompt', 'Summarize project health and next actions.'));
    const cronExpression = this.flag(args, '--cron') ?? await this.ask(smartInput, 'Cron expression', type === 'report' ? '0 9 * * 1' : '0 9 * * *');
    const name = this.flag(args, '--name') ?? await this.ask(smartInput, 'Schedule name', type === 'report' ? 'Weekly report' : 'Scheduled prompt');
    const environmentId = this.flag(args, '--env');

    return {
      projectRoot: process.cwd(),
      name,
      cronExpression,
      target: {
        type,
        ref: name,
        config: {
          prompt,
          input: this.flag(args, '--input') ?? prompt,
          expected: this.flag(args, '--expected'),
          dryRun: true,
        },
      },
      environmentId,
      approvalPolicy: 'dry-run-only',
      sandbox: this.sandboxConfig(args),
      budget: {
        maxCases: 1,
        maxCostUsd: this.numberFlag(args, '--max-cost') ?? 0.5,
        maxTokens: this.numberFlag(args, '--max-tokens') ?? 20_000,
        allowLlmJudge: false,
      },
      maxRuntimeMs: this.numberFlag(args, '--max-runtime-ms') ?? 600_000,
      tags: [type, environmentId].filter((tag): tag is string => typeof tag === 'string' && tag.length > 0),
    };
  }

  private async run(scheduleId?: string): Promise<void> {
    if (!scheduleId) {
      process.stdout.write('Usage: /schedule run <scheduleId>\n');
      return;
    }

    const result = await this.runner.runSchedule(scheduleId, { manual: true, unattended: false });
    await this.syncRun(result.schedule, result.run);
    this.printRun(result.run);
    if (result.benchmarkRun) {
      process.stdout.write(`Benchmark run: ${result.benchmarkRun.status} ${result.benchmarkRun.id}\n`);
    }
  }

  private async tick(): Promise<void> {
    const result = await this.runner.runDue(process.cwd(), new Date());
    if (result.runs.length === 0) {
      process.stdout.write(`No due schedules at ${result.checkedAt}.\n`);
      return;
    }
    for (const item of result.runs) {
      await this.syncRun(item.schedule, item.run);
      this.printRun(item.run);
    }
  }

  private async status(scheduleId: string | undefined, status: ScheduleDefinition['status']): Promise<void> {
    if (!scheduleId) {
      process.stdout.write(`Usage: /schedule ${status === 'paused' ? 'pause' : 'resume'} <scheduleId>\n`);
      return;
    }
    const schedule = await this.store.setStatus(scheduleId, status);
    if (!schedule) {
      process.stdout.write(`Schedule not found: ${scheduleId}\n`);
      return;
    }
    await this.platformSync?.syncDefinition(schedule);
    process.stdout.write(`Schedule ${status}: ${schedule.id} ${schedule.name}\n`);
  }

  private async logs(scheduleId?: string): Promise<void> {
    if (!scheduleId) {
      const runs = await this.store.listProjectRuns(process.cwd(), 20);
      this.printLogs(runs);
      return;
    }
    const runs = await this.store.listRuns(scheduleId, 20);
    this.printLogs(runs);
  }

  private printLogs(runs: ScheduleRun[]): void {
    if (runs.length === 0) {
      process.stdout.write('No schedule runs found.\n');
      return;
    }
    process.stdout.write('Schedule runs:\n');
    for (const run of runs) {
      const completed = run.completedAt ? ` ended=${run.completedAt}` : '';
      const benchmark = run.benchmarkRunId ? ` benchmark=${run.benchmarkRunId}` : '';
      process.stdout.write(`- ${run.id} schedule=${run.scheduleId} status=${run.status} started=${run.startedAt}${completed}${benchmark}\n`);
      if (run.error) {
        process.stdout.write(`  error=${run.error}\n`);
      }
    }
  }

  private printRun(run: ScheduleRun): void {
    process.stdout.write(`Schedule run: ${run.status} ${run.id}\n`);
    if (run.error) {
      process.stdout.write(`Schedule error: ${run.error}\n`);
    }
  }

  private async syncRun(schedule: ScheduleDefinition, run: ScheduleRun): Promise<void> {
    const result = await this.platformSync?.syncRun(schedule, run);
    this.printSyncResult(result);
  }

  private printSyncResult(result: Awaited<ReturnType<SchedulePlatformSyncService['syncDefinition']>> | undefined): void {
    if (!result || result.status === 'synced' || result.status === 'skipped') {
      return;
    }
    process.stdout.write(`[platform] Schedule sync queued: ${result.message ?? 'platform unavailable'}\n`);
  }

  private printHelp(): void {
    process.stdout.write([
      'Schedule commands:',
      '- /schedule list',
      '- /schedule suggest [environment-id]',
      '- /schedule create suggested <suggestion-id> [environment-id]',
      '- /schedule create benchmark <definitionId> --cron "0 * * * *"',
      '- /schedule create environment_task <environmentId> --task "Review campaign performance"',
      '- /schedule create agent_prompt --prompt "Summarize project health"',
      '- /schedule create report --prompt "Prepare weekly benchmark report"',
      '- /schedule run <scheduleId>',
      '- /schedule tick',
      '- /schedule pause <scheduleId>',
      '- /schedule resume <scheduleId>',
      '- /schedule logs [scheduleId]',
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

  private approvalPolicy(value: string): ScheduleApprovalPolicy {
    if (value === 'approval-required' || value === 'pre-approved' || value === 'dry-run-only') {
      return value;
    }
    return 'dry-run-only';
  }

  private flag(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    if (index < 0) {
      return undefined;
    }
    return args[index + 1];
  }

  private numberFlag(args: string[], name: string): number | undefined {
    const value = this.flag(args, name);
    if (value === undefined) {
      return undefined;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private sandboxConfig(args: string[]): CreateScheduleInput['sandbox'] {
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
}
