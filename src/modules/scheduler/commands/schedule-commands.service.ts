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
import { ScheduleWorkerService, type ScheduleWorkerResult } from '../services/schedule-worker.service';
import { CommandUiService } from '../../repl/services/command-ui.service';
import { colorize } from '../../repl/utils/theme';

type SmartInputLike = {
  question?: (message: string) => Promise<string>;
  askChoice?: (message: string, choices: Array<{ key: string; label: string; description?: string }>) => Promise<string>;
};

@Injectable()
export class ScheduleCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly store: ScheduleStoreService,
    private readonly runner: ScheduleRunnerService,
    private readonly cron: ScheduleCronService,
    private readonly suggestions: ScheduleSuggestionService,
    @Optional()
    private readonly platformSync?: SchedulePlatformSyncService,
    @Optional()
    private readonly worker?: ScheduleWorkerService,
  ) {}

  setAgentExecutor(_executor: BenchmarkAgentExecutor): void {
    // Schedule execution reuses BenchmarkTargetService's agent executor through BenchmarkCommandsService.
  }

  async cmdSchedule(args: string[], smartInput?: SmartInputLike): Promise<void> {
    const subcommand = (args[0] ?? 'overview').toLowerCase();
    switch (subcommand) {
    case 'overview':
    case 'dashboard':
      await this.overview();
      return;
    case 'list':
    case 'ls':
      await this.list();
      return;
    case 'next':
      await this.next();
      return;
    case 'create':
    case 'new':
      await this.create(args.slice(1), smartInput);
      return;
    case 'suggest':
    case 'suggestions':
      await this.suggest(args.slice(1));
      return;
    case 'run':
      await this.run(args[1]);
      return;
    case 'tick':
      await this.tick();
      return;
    case 'due':
      await this.due();
      return;
    case 'pause':
      await this.setScheduleStatus(args[1], 'paused');
      return;
    case 'resume':
      await this.setScheduleStatus(args[1], 'active');
      return;
    case 'status':
    case 'show':
    case 'inspect':
      await this.showStatus(args[1]);
      return;
    case 'logs':
    case 'history':
      await this.logs(args[1]);
      return;
    case 'worker':
      await this.workerCommand(args.slice(1));
      return;
    case 'install-worker':
      await this.workerCommand(['install', ...args.slice(1)]);
      return;
    case 'uninstall-worker':
      await this.workerCommand(['uninstall', ...args.slice(1)]);
      return;
    case 'help':
    default:
      this.printHelp();
    }
  }

  private async overview(): Promise<void> {
    const schedules = await this.store.list(process.cwd());
    const due = await this.store.listDue(process.cwd(), new Date());
    const suggestions = await this.suggestions.list(process.cwd()).catch(() => []);
    const active = schedules.filter((schedule) => schedule.status === 'active').length;
    const paused = schedules.filter((schedule) => schedule.status === 'paused').length;

    const lines = schedules.length === 0
      ? [
        colorize('No schedules yet.', 'muted'),
        'Use /schedule create to open the guided wizard.',
        'Use /schedule suggest to inspect environment-based templates.',
      ]
      : schedules.slice(0, 8).map((schedule) => this.formatScheduleLine(schedule));

    if (suggestions.length > 0) {
      lines.push('');
      lines.push(colorize('Suggested starters', 'muted'));
      for (const suggestion of suggestions.slice(0, 3)) {
        lines.push(`${colorize(suggestion.id, 'cyan')}  ${suggestion.name}  ${colorize(this.cron.describe(suggestion.cronExpression), 'subtle')}`);
      }
    }

    process.stdout.write(this.ui.panel({
      title: 'Scheduler',
      subtitle: `${schedules.length} local`,
      sections: [
        {
          title: 'Status',
          rows: [
            { label: 'Active', value: String(active) },
            { label: 'Paused', value: String(paused) },
            { label: 'Due now', value: String(due.length) },
          ],
        },
        { title: schedules.length === 0 ? 'Get started' : 'Next schedules', lines },
      ],
      footer: '/schedule create opens a wizard · /schedule status <id> shows details · /schedule tick runs due schedules',
    }));
  }

  private async list(): Promise<void> {
    const schedules = await this.store.list(process.cwd());
    if (schedules.length === 0) {
      process.stdout.write(this.ui.panel({
        title: 'Scheduler',
        subtitle: '0 local',
        sections: [{
          lines: [
            colorize('No schedules yet.', 'muted'),
            'Run /schedule create for the guided wizard.',
            'Run /schedule suggest to inspect environment templates.',
          ],
        }],
      }));
      return;
    }

    this.printScheduleList('Local schedules', schedules, '/schedule status <id> for details · /schedule due previews due work');
  }

  private async next(): Promise<void> {
    const schedules = (await this.store.list(process.cwd()))
      .filter((schedule) => schedule.status === 'active' && schedule.nextRunAt);
    this.printScheduleList('Next schedules', schedules, '/schedule due previews schedules ready to run');
  }

  private async suggest(args: string[]): Promise<void> {
    const environmentId = args[0];
    const suggestions = await this.suggestions.list(process.cwd(), environmentId);
    if (suggestions.length === 0) {
      process.stdout.write(this.ui.warning(environmentId
        ? `No schedule suggestions found for environment: ${environmentId}`
        : 'No schedule suggestions found. Run /env list to inspect environments.'));
      return;
    }

    process.stdout.write(this.ui.panel({
      title: 'Suggested schedules',
      subtitle: environmentId ?? 'all environments',
      sections: [{
        lines: suggestions.flatMap((suggestion) => [
          `${colorize(suggestion.id, 'cyan')}  ${colorize(suggestion.environmentId, 'muted')}  ${suggestion.name}  ${colorize(this.cron.describe(suggestion.cronExpression), 'subtle')}`,
          `  ${colorize(suggestion.description, 'muted')}`,
        ]),
      }],
      footer: 'Create one with /schedule create suggested <suggestion-id> [environment-id]',
    }));
  }

  private async create(args: string[], smartInput?: SmartInputLike): Promise<void> {
    const rawType = args[0]?.toLowerCase();
    const type = rawType || await this.chooseScheduleType(smartInput);
    const typeArgs = rawType ? args : [type, ...args];
    let input: CreateScheduleInput | null = null;

    if (type === 'suggested') {
      input = await this.createSuggested(typeArgs, smartInput);
    } else if (type === 'benchmark') {
      input = await this.createBenchmark(typeArgs, smartInput);
    } else if (type === 'environment_task') {
      input = await this.createEnvironmentTask(typeArgs, smartInput);
    } else if (type === 'agent_prompt' || type === 'report') {
      input = await this.createAgentPrompt(type, typeArgs, smartInput);
    } else {
      this.printCreateHelp();
      return;
    }

    if (!input) {
      return;
    }

    const schedule = await this.store.save(input);
    const syncResult = await this.platformSync?.syncDefinition(schedule);
    process.stdout.write(this.ui.success(`Schedule created: ${schedule.id} ${schedule.name}`));
    process.stdout.write(this.ui.panel({
      title: 'Next steps',
      sections: [{
        lines: [
          `/schedule status ${schedule.id}`,
          `/schedule run ${schedule.id}`,
          '/schedule list',
        ],
      }],
    }));
    this.printSyncResult(syncResult);
  }

  private async createSuggested(args: string[], smartInput?: SmartInputLike): Promise<CreateScheduleInput | null> {
    const suggestionId = args[1] ?? await this.ask(smartInput, 'Suggestion id', '');
    const environmentId = this.flag(args, '--env') ?? (args[2]?.startsWith('--') ? undefined : args[2]);
    if (!suggestionId) {
      process.stdout.write(this.ui.error('Usage: /schedule create suggested <suggestion-id> [environment-id]'));
      return null;
    }
    const suggestion = await this.suggestions.get(process.cwd(), suggestionId, environmentId);
    if (!suggestion) {
      process.stdout.write(this.ui.error(`Schedule suggestion not found: ${suggestionId}`));
      return null;
    }
    return this.suggestions.toCreateInput(suggestion, process.cwd());
  }

  private async createBenchmark(args: string[], smartInput?: SmartInputLike): Promise<CreateScheduleInput | null> {
    const definitionId = args[1] ?? await this.ask(smartInput, 'Benchmark definition id', '');
    if (!definitionId) {
      process.stdout.write(this.ui.error('Usage: /schedule create benchmark <definitionId> [--cron "0 * * * *"]'));
      return null;
    }

    const cronExpression = await this.resolveCronExpression(args, smartInput, '0 * * * *');
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
    const cronExpression = await this.resolveCronExpression(args, smartInput, '0 9 * * 1');
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
    const cronExpression = await this.resolveCronExpression(args, smartInput, type === 'report' ? '0 9 * * 1' : '0 9 * * *');
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
      process.stdout.write(this.ui.error('Usage: /schedule run <scheduleId>'));
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
      process.stdout.write(this.ui.warning(`No due schedules at ${result.checkedAt}.`));
      return;
    }
    for (const item of result.runs) {
      await this.syncRun(item.schedule, item.run);
      this.printRun(item.run);
    }
  }

  private async due(): Promise<void> {
    const schedules = await this.store.listDue(process.cwd(), new Date());
    if (schedules.length === 0) {
      process.stdout.write(this.ui.panel({
        title: 'Due schedules',
        subtitle: '0 ready',
        sections: [{ lines: [colorize('No schedules are due right now.', 'muted')] }],
        footer: '/schedule next shows upcoming active schedules',
      }));
      return;
    }

    process.stdout.write(this.ui.panel({
      title: 'Due schedules',
      subtitle: `${schedules.length} ready`,
      sections: [{ lines: schedules.map((schedule) => this.formatScheduleLine(schedule)) }],
      footer: '/schedule tick runs due schedules · /schedule run <id> runs one manually',
    }));
  }

  private async setScheduleStatus(scheduleId: string | undefined, status: ScheduleDefinition['status']): Promise<void> {
    if (!scheduleId) {
      process.stdout.write(this.ui.error(`Usage: /schedule ${status === 'paused' ? 'pause' : 'resume'} <scheduleId>`));
      return;
    }
    const schedule = await this.store.setStatus(scheduleId, status);
    if (!schedule) {
      process.stdout.write(this.ui.error(`Schedule not found: ${scheduleId}`));
      return;
    }
    await this.platformSync?.syncDefinition(schedule);
    process.stdout.write(this.ui.success(`Schedule ${status}: ${schedule.id} ${schedule.name}`));
  }

  private async showStatus(scheduleId?: string): Promise<void> {
    if (!scheduleId) {
      process.stdout.write(this.ui.error('Usage: /schedule status <scheduleId>'));
      return;
    }
    const schedule = await this.store.get(scheduleId);
    if (!schedule) {
      process.stdout.write(this.ui.error(`Schedule not found: ${scheduleId}`));
      return;
    }
    const runs = await this.store.listRuns(schedule.id, 5);
    process.stdout.write(this.ui.panel({
      title: 'Schedule',
      subtitle: schedule.id,
      sections: [
        {
          title: 'Details',
          rows: [
            { label: 'Name', value: schedule.name },
            { label: 'Status', value: schedule.status },
            { label: 'Target', value: this.targetLabel(schedule) },
            { label: 'Cron', value: `${schedule.cronExpression} (${this.cron.describe(schedule.cronExpression)})` },
            { label: 'Next run', value: this.formatDate(schedule.nextRunAt) },
            { label: 'Last run', value: this.formatDate(schedule.lastRunAt) },
            { label: 'Approval', value: schedule.approvalPolicy },
            { label: 'Sandbox', value: schedule.sandbox?.mode ?? 'snapshot' },
          ],
        },
        {
          title: 'Recent runs',
          lines: runs.length > 0
            ? runs.map((run) => this.formatRunLine(run))
            : [colorize('No runs recorded yet.', 'muted')],
        },
      ],
      footer: `Run now with /schedule run ${schedule.id}`,
    }));
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

  private async workerCommand(args: string[]): Promise<void> {
    if (!this.worker) {
      process.stdout.write(this.ui.error('Schedule background worker is not available in this runtime.'));
      return;
    }

    const subcommand = (args[0] ?? 'status').toLowerCase();
    const projectRoot = process.cwd();
    try {
      if (subcommand === 'install' || subcommand === 'enable') {
        const intervalSeconds = this.numberFlag(args, '--interval-seconds') ?? this.numberFlag(args, '--every-seconds') ?? 60;
        this.printWorkerResult(await this.worker.install({ projectRoot, intervalSeconds }));
        return;
      }
      if (subcommand === 'uninstall' || subcommand === 'disable' || subcommand === 'remove') {
        this.printWorkerResult(await this.worker.uninstall(projectRoot));
        return;
      }
      if (subcommand === 'tick') {
        await this.tick();
        return;
      }
      if (subcommand === 'status' || subcommand === 'show') {
        this.printWorkerResult(await this.worker.status(projectRoot));
        return;
      }
      this.printWorkerHelp();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(this.ui.error(`Schedule worker failed: ${message}`));
    }
  }

  private printWorkerResult(result: ScheduleWorkerResult): void {
    const rows = [
      { label: 'OS', value: result.platform },
      { label: 'Supported', value: result.supported ? 'yes' : 'no' },
      { label: 'Installed', value: result.installed ? 'yes' : 'no' },
      { label: 'Project', value: result.projectRoot },
    ];
    if (result.timerName) {
      rows.push({ label: 'Timer', value: result.timerName });
    }
    if (result.active) {
      rows.push({ label: 'Active', value: result.active });
    }
    if (result.enabled) {
      rows.push({ label: 'Enabled', value: result.enabled });
    }

    process.stdout.write(this.ui.panel({
      title: 'Schedule worker',
      subtitle: result.supported ? 'background' : 'unsupported',
      sections: [
        { rows },
        {
          title: 'Result',
          lines: [
            result.message,
            ...(result.servicePath ? [`service=${result.servicePath}`] : []),
            ...(result.timerPath ? [`timer=${result.timerPath}`] : []),
            ...(result.command ? [`command=${result.command.join(' ')}`] : []),
          ],
        },
        ...(result.notes.length > 0 ? [{ title: 'Notes', lines: result.notes }] : []),
      ],
      footer: '/schedule worker status · /schedule worker uninstall',
    }));
  }

  private printWorkerHelp(): void {
    process.stdout.write(this.ui.panel({
      title: 'Schedule worker',
      sections: [{
        lines: [
          '/schedule worker status',
          '/schedule worker install [--interval-seconds 60]',
          '/schedule worker uninstall',
          '/schedule worker tick',
        ],
      }],
      footer: 'On Ubuntu/Linux, install creates a systemd user timer for this project.',
    }));
  }

  private printLogs(runs: ScheduleRun[]): void {
    if (runs.length === 0) {
      process.stdout.write(this.ui.warning('No schedule runs found.'));
      return;
    }
    process.stdout.write(this.ui.panel({
      title: 'Schedule runs',
      subtitle: `${runs.length} recent`,
      sections: [{ lines: runs.map((run) => this.formatRunLine(run)) }],
      footer: 'Use /schedule status <id> for schedule details.',
    }));
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
    process.stdout.write(this.ui.panel({
      title: 'Schedule commands',
      sections: [{
        lines: [
          '/schedule                              dashboard',
          '/schedule create                       guided wizard',
          '/schedule suggest [environment-id]     templates from environments',
          '/schedule list | next | due            inspect scheduled work',
          '/schedule status <id>                  details and recent runs',
          '/schedule run <id>                     run one schedule now',
          '/schedule tick                         run every due active schedule',
          '/schedule worker install               run due schedules in the background',
          '/schedule pause <id> | resume <id>     control active schedules',
          '/schedule logs [id]                    recent runs',
        ],
      }],
      footer: 'Schedules are local, persisted in ~/.cast/state.db, and default to dry-run/sandboxed execution.',
    }));
  }

  private printCreateHelp(): void {
    process.stdout.write(this.ui.panel({
      title: 'Create schedule',
      sections: [{
        lines: [
          '/schedule create report --prompt "Prepare weekly project report"',
          '/schedule create report --every weekly --weekday monday --at 09:30 --prompt "Prepare weekly report"',
          '/schedule create agent_prompt --prompt "Summarize project health"',
          '/schedule create environment_task engineering --task "Review test health"',
          '/schedule create benchmark <definitionId> --cron "0 * * * *"',
          '/schedule create suggested <suggestion-id> [environment-id]',
        ],
      }],
      footer: 'Run /schedule create with no type to open the wizard.',
    }));
  }

  private async chooseScheduleType(smartInput?: SmartInputLike): Promise<string> {
    if (!smartInput?.askChoice) {
      return '';
    }
    return smartInput.askChoice('Schedule type', [
      { key: 'report', label: 'Report', description: 'Recurring report prompt, dry-run by default' },
      { key: 'agent_prompt', label: 'Agent prompt', description: 'Run a focused prompt on a schedule' },
      { key: 'environment_task', label: 'Environment task', description: 'Run a task inside a Cast environment' },
      { key: 'suggested', label: 'Suggested', description: 'Use an environment-provided template' },
      { key: 'benchmark', label: 'Benchmark', description: 'Run an existing benchmark definition' },
    ]);
  }

  private printScheduleList(title: string, schedules: ScheduleDefinition[], footer: string): void {
    if (schedules.length === 0) {
      process.stdout.write(this.ui.panel({
        title,
        subtitle: '0 found',
        sections: [{ lines: [colorize('No schedules found.', 'muted')] }],
        footer: '/schedule create opens the guided wizard',
      }));
      return;
    }
    process.stdout.write(this.ui.panel({
      title,
      subtitle: `${schedules.length} found`,
      sections: [{ lines: schedules.map((schedule) => this.formatScheduleLine(schedule)) }],
      footer,
    }));
  }

  private formatScheduleLine(schedule: ScheduleDefinition): string {
    const status = schedule.status === 'active'
      ? colorize('active', 'success')
      : colorize('paused', 'warning');
    return [
      colorize(schedule.id, 'cyan'),
      schedule.name,
      status,
      colorize(this.targetLabel(schedule), 'subtle'),
      colorize(this.cron.describe(schedule.cronExpression), 'muted'),
      `next=${this.formatDate(schedule.nextRunAt)}`,
    ].join('  ');
  }

  private formatRunLine(run: ScheduleRun): string {
    const completed = run.completedAt ? ` ended=${this.formatDate(run.completedAt)}` : '';
    const benchmark = run.benchmarkRunId ? ` benchmark=${run.benchmarkRunId}` : '';
    const error = run.error ? ` error=${run.error}` : '';
    return `${colorize(run.id, 'cyan')}  schedule=${run.scheduleId}  status=${run.status}  started=${this.formatDate(run.startedAt)}${completed}${benchmark}${error}`;
  }

  private targetLabel(schedule: ScheduleDefinition): string {
    const ref = schedule.target.ref ? `:${schedule.target.ref}` : '';
    return `${schedule.target.type}${ref}`;
  }

  private formatDate(value?: string): string {
    if (!value) {
      return 'not scheduled';
    }
    return value.replace('T', ' ').replace('.000Z', 'Z');
  }

  private async ask(smartInput: SmartInputLike | undefined, question: string, fallback: string): Promise<string> {
    if (!smartInput?.question) {
      return fallback;
    }
    const answer = await smartInput.question(question);
    return answer.trim() || fallback;
  }

  private async resolveCronExpression(args: string[], smartInput: SmartInputLike | undefined, fallback: string): Promise<string> {
    const explicitCron = this.flag(args, '--cron');
    if (explicitCron) {
      return explicitCron;
    }

    const presetCron = this.cronFromHumanPreset(args);
    if (presetCron) {
      return presetCron;
    }

    return this.ask(smartInput, 'Cron expression', fallback);
  }

  private cronFromHumanPreset(args: string[]): string | undefined {
    const every = this.flag(args, '--every')?.toLowerCase();
    if (!every) {
      return undefined;
    }

    const hourlyPreset = every === 'hour' || every === 'hourly';
    const time = this.parseTimeFlag(this.flag(args, '--at') ?? (hourlyPreset ? '00' : '09:00'), every);
    if (!time) {
      return undefined;
    }

    switch (every) {
    case 'hour':
    case 'hourly':
      return `${time.minute} * * * *`;
    case 'day':
    case 'daily':
      return `${time.minute} ${time.hour} * * *`;
    case 'weekday':
    case 'weekdays':
      return `${time.minute} ${time.hour} * * 1-5`;
    case 'week':
    case 'weekly': {
      const weekday = this.weekdayNumber(this.flag(args, '--weekday') ?? 'monday');
      return weekday === undefined ? undefined : `${time.minute} ${time.hour} * * ${weekday}`;
    }
    default:
      return undefined;
    }
  }

  private parseTimeFlag(value: string, every: string): { hour: number; minute: number } | undefined {
    const trimmed = value.trim();
    if (/^\d{1,2}$/.test(trimmed)) {
      const number = Number(trimmed);
      if (every === 'hour' || every === 'hourly') {
        return number >= 0 && number <= 59 ? { hour: 0, minute: number } : undefined;
      }
      return number >= 0 && number <= 23 ? { hour: number, minute: 0 } : undefined;
    }

    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!match) {
      return undefined;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return undefined;
    }
    return { hour, minute };
  }

  private weekdayNumber(value: string): number | undefined {
    const normalized = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const weekdays: Record<string, number> = {
      sunday: 0,
      sun: 0,
      domingo: 0,
      monday: 1,
      mon: 1,
      segunda: 1,
      tuesday: 2,
      tue: 2,
      terca: 2,
      wednesday: 3,
      wed: 3,
      quarta: 3,
      thursday: 4,
      thu: 4,
      quinta: 4,
      friday: 5,
      fri: 5,
      sexta: 5,
      saturday: 6,
      sat: 6,
      sabado: 6,
    };
    return weekdays[normalized];
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
