import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { CommandUiService } from '../../repl/services/command-ui.service';
import { colorize } from '../../repl/utils/theme';
import { SwarmDispatcherService } from '../services/swarm-dispatcher.service';
import { SwarmIntegrationService } from '../services/swarm-integration.service';
import { SwarmPlanApprovalService } from '../services/swarm-plan-approval.service';
import { SwarmPlannerService } from '../services/swarm-planner.service';
import { SwarmRunStoreService } from '../services/swarm-run-store.service';
import type { SwarmPlan, SwarmRun } from '../types';

type SmartInputLike = {
  question?: (message: string) => Promise<string>;
  askChoice?: (
    message: string,
    choices: Array<{ key: string; label: string; description?: string }>,
  ) => Promise<string>;
};

@Injectable()
export class SwarmCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly store: SwarmRunStoreService,
    private readonly planner: SwarmPlannerService,
    private readonly approval: SwarmPlanApprovalService,
    private readonly dispatcher: SwarmDispatcherService,
    private readonly integration: SwarmIntegrationService,
  ) {}

  async cmdSwarm(args: string[], smartInput?: SmartInputLike): Promise<void> {
    const subcommand = (args[0] ?? 'status').toLowerCase();
    switch (subcommand) {
    case 'plan':
      await this.plan(args.slice(1).join(' '), smartInput);
      return;
    case 'status':
      await this.status();
      return;
    case 'show':
      await this.show(args[1]);
      return;
    case 'approve':
      await this.approve(args[1], smartInput);
      return;
    case 'cancel':
      await this.cancel(args[1]);
      return;
    case 'run':
      await this.run(args.slice(1));
      return;
    case 'workers':
      await this.workers(args[1]);
      return;
    case 'integrate':
      await this.integrate(args.slice(1));
      return;
    case 'help':
    default:
      this.printHelp();
    }
  }

  async offerForPrompt(prompt: string, smartInput?: SmartInputLike): Promise<boolean> {
    if (!smartInput?.askChoice) {
      return false;
    }

    const suggestion = this.planner.evaluateSuggestion(prompt);
    if (!suggestion.shouldSuggest) {
      return false;
    }

    const choice = await smartInput.askChoice(`Agent Swarm suggested: ${suggestion.reason}`, [
      { key: 'plan', label: 'Create Swarm Plan', description: 'draft worker contracts before execution' },
      { key: 'normal', label: 'Continue normally', description: 'send prompt through the current runtime' },
    ]);

    if (choice !== 'plan') {
      return false;
    }

    await this.plan(prompt, smartInput, { skipSuggestionPrompt: true });
    return true;
  }

  private async plan(
    prompt: string,
    smartInput?: SmartInputLike,
    options: { skipSuggestionPrompt?: boolean } = {},
  ): Promise<void> {
    const goal = prompt.trim();
    if (!goal) {
      if (smartInput?.question) {
        const answered = (await smartInput.question('Swarm goal: ')).trim();
        if (!answered) {
          process.stdout.write(this.ui.error('A goal is required. Usage: /swarm plan <prompt>'));
          return;
        }
        await this.plan(answered, smartInput);
        return;
      }
      process.stdout.write(this.ui.error('Usage: /swarm plan <prompt>'));
      return;
    }

    const suggestion = this.planner.evaluateSuggestion(goal);
    if (!options.skipSuggestionPrompt && suggestion.shouldSuggest && smartInput?.askChoice) {
      const proceed = await smartInput.askChoice(suggestion.reason, [
        { key: 'yes', label: 'Generate Swarm Plan' },
        { key: 'no', label: 'Cancel' },
      ]);
      if (proceed !== 'yes') {
        process.stdout.write(this.ui.warning('Swarm planning cancelled.'));
        return;
      }
    }

    const plan = await this.planner.generatePlan({ goal, projectRoot: process.cwd() });
    const yaml = this.approval.formatPlanYaml(plan);

    process.stdout.write(this.ui.panel({
      title: 'Agent Swarm Plan',
      subtitle: plan.id,
      sections: [
        {
          title: 'Summary',
          rows: [
            { label: 'Status', value: plan.status },
            { label: 'Tasks', value: String(plan.tasks.length) },
            { label: 'Max workers', value: String(plan.globalConstraints.maxWorkers) },
            { label: 'Integration', value: plan.integrationMode },
          ],
        },
        { title: 'Contract', lines: yaml.split('\n') },
      ],
      footer: '/swarm approve <plan-id> · /swarm run [--dry-run] <run-id>',
    }));

    if (smartInput?.askChoice) {
      const next = await smartInput.askChoice('Next step?', [
        { key: 'approve', label: 'Approve this plan now' },
        { key: 'later', label: 'Keep draft and exit' },
      ]);
      if (next === 'approve') {
        await this.approve(plan.id, smartInput);
      }
    }
  }

  private async approve(planId: string | undefined, smartInput?: SmartInputLike): Promise<void> {
    const plan = await this.resolvePlan(planId);
    if (!plan) return;

    const result = await this.approval.requestApproval(plan, smartInput);
    if (!result.approved) {
      process.stdout.write(this.ui.warning(`Plan ${result.plan.id} remains ${result.plan.status}.`));
      return;
    }

    const run = await this.createApprovedRun(result.plan);
    process.stdout.write(this.ui.success(`Swarm plan approved. Run ${run.id} is ready. Use /swarm run ${run.id}`));
  }

  private async createApprovedRun(plan: SwarmPlan): Promise<SwarmRun> {
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const run: SwarmRun = {
      id: runId,
      planId: plan.id,
      status: 'approved',
      projectRoot: plan.projectRoot,
      workspaceRoot: plan.workspaceRoot,
      integrationMode: plan.integrationMode,
      runtimePolicy: plan.runtimePolicy,
      tasks: plan.tasks.map((task) => ({
        id: crypto.randomUUID(),
        planTaskId: task.id,
        status: 'queued',
        workerId: task.worker.id,
        worktreePath: '',
        branchName: `cast/swarm/${runId}/${task.id}`,
      })),
      createdAt: now,
    };
    return this.store.saveRun(run);
  }

  private async run(args: string[]): Promise<void> {
    const dryRun = args.includes('--dry-run');
    const runId = args.find((arg) => !arg.startsWith('--'));
    const run = await this.resolveRun(runId);
    if (!run) return;

    if (!['approved', 'planned'].includes(run.status)) {
      process.stdout.write(this.ui.warning(`Run ${run.id} is ${run.status}. Only approved runs can execute.`));
      return;
    }

    process.stdout.write(this.ui.panel({
      title: 'Agent Swarm Run',
      subtitle: run.id,
      sections: [{
        title: 'Starting',
        lines: [
          dryRun ? colorize('Mode: dry-run (no model calls)', 'muted') : colorize('Mode: live workers', 'muted'),
          `Tasks: ${run.tasks.length}`,
        ],
      }],
    }));

    const completed = await this.dispatcher.dispatch({ runId: run.id, dryRun });
    const integrated = completed.tasks.filter((task) => task.status === 'integrated').length;
    process.stdout.write(this.ui.panel({
      title: 'Agent Swarm Run',
      subtitle: completed.id,
      sections: [{
        title: 'Result',
        rows: [
          { label: 'Status', value: completed.status },
          { label: 'Completed tasks', value: String(completed.tasks.filter((task) => task.status === 'completed').length) },
          { label: 'Integrated', value: String(integrated) },
          { label: 'Failed/blocked', value: String(completed.tasks.filter((task) => ['failed', 'blocked'].includes(task.status)).length) },
        ],
      }],
      footer: completed.integrationMode === 'manual'
        ? `/swarm integrate ${completed.id}`
        : '/swarm show <run-id>',
    }));
  }

  private async integrate(args: string[]): Promise<void> {
    const force = args.includes('--force');
    const runId = args.find((arg) => !arg.startsWith('--'));
    const run = await this.resolveRun(runId);
    if (!run) return;

    const { run: updated, summary } = await this.integration.integrateRun(run.id, { force });
    process.stdout.write(this.ui.panel({
      title: 'Swarm Integration',
      subtitle: updated.id,
      sections: [
        {
          title: 'Summary',
          rows: [
            { label: 'Mode', value: updated.integrationMode },
            { label: 'Applied', value: String(summary.applied) },
            { label: 'Manual review', value: String(summary.manualReview) },
            { label: 'Conflicts', value: String(summary.conflicts) },
            { label: 'Violations', value: String(summary.violations) },
            { label: 'Run status', value: updated.status },
          ],
        },
        {
          title: 'Final verification',
          lines: summary.finalVerification.length > 0
            ? summary.finalVerification.map((step) =>
              `${step.status === 'passed' ? colorize('✓', 'success') : colorize('✗', 'error')} ${step.command}`,
            )
            : [colorize('No final verification steps configured.', 'muted')],
        },
      ],
      footer: '/swarm show <run-id> for per-task integration details',
    }));
  }

  private async workers(runId?: string): Promise<void> {
    const run = await this.resolveRun(runId);
    if (!run) return;

    const lines = run.tasks.map((task) => {
      const handoff = task.handoff?.summary ? colorize(task.handoff.summary.slice(0, 72), 'subtle') : colorize('no handoff', 'muted');
      return `${colorize(task.planTaskId, 'cyan')}  ${task.status}  ${task.branchName}  ${handoff}`;
    });

    process.stdout.write(this.ui.panel({
      title: 'Swarm Workers',
      subtitle: run.id,
      sections: [{ title: 'Task runs', lines: lines.length > 0 ? lines : [colorize('No workers recorded.', 'muted')] }],
    }));
  }

  private async status(): Promise<void> {
    const projectRoot = process.cwd();
    const plans = await this.store.listPlans(projectRoot, 10);
    const runs = await this.store.listRuns(projectRoot, 10);

    const planLines = plans.length === 0
      ? [colorize('No swarm plans yet.', 'muted')]
      : plans.map((plan) => `${colorize(plan.id.slice(0, 8), 'cyan')}  ${plan.status}  ${plan.tasks.length} tasks  ${colorize(plan.goal.slice(0, 48), 'subtle')}`);

    const runLines = runs.length === 0
      ? [colorize('No swarm runs yet.', 'muted')]
      : runs.map((run) => `${colorize(run.id.slice(0, 8), 'cyan')}  ${run.status}  plan ${colorize(run.planId.slice(0, 8), 'subtle')}`);

    process.stdout.write(this.ui.panel({
      title: 'Agent Swarm',
      subtitle: projectRoot,
      sections: [
        { title: 'Recent plans', lines: planLines },
        { title: 'Recent runs', lines: runLines },
      ],
      footer: '/swarm plan <prompt> · /swarm show <id>',
    }));
  }

  private async show(id?: string): Promise<void> {
    if (!id) {
      process.stdout.write(this.ui.error('Usage: /swarm show <plan-id|run-id>'));
      return;
    }

    const plan = await this.store.getPlan(id);
    if (plan) {
      process.stdout.write(this.ui.panel({
        title: 'Swarm Plan',
        subtitle: plan.id,
        sections: [
          {
            title: 'Metadata',
            rows: [
              { label: 'Status', value: plan.status },
              { label: 'Goal', value: plan.goal },
              { label: 'Reason', value: plan.reasonForSwarm },
            ],
          },
          { title: 'Contract', lines: this.approval.formatPlanYaml(plan).split('\n') },
        ],
      }));
      return;
    }

    const run = await this.store.getRun(id);
    if (run) {
      const lines = run.tasks.map((task) => {
        const worktree = task.worktreePath ? colorize(task.worktreePath, 'subtle') : colorize('pending', 'muted');
        const integration = task.integration?.status
          ? colorize(task.integration.status, task.integration.status === 'applied' ? 'success' : 'muted')
          : colorize('n/a', 'muted');
        return `${colorize(task.planTaskId, 'cyan')}  ${task.status}  ${integration}  ${worktree}`;
      });
      process.stdout.write(this.ui.panel({
        title: 'Swarm Run',
        subtitle: run.id,
        sections: [
          {
            title: 'Metadata',
            rows: [
              { label: 'Status', value: run.status },
              { label: 'Plan', value: run.planId },
              { label: 'Integration', value: run.integrationMode },
            ],
          },
          { title: 'Tasks', lines: lines.length > 0 ? lines : [colorize('No task runs recorded.', 'muted')] },
        ],
      }));
      return;
    }

    process.stdout.write(this.ui.error(`No swarm plan or run found for ${id}`));
  }

  private async cancel(runId?: string): Promise<void> {
    if (!runId) {
      process.stdout.write(this.ui.error('Usage: /swarm cancel <run-id>'));
      return;
    }

    const run = await this.store.getRun(runId);
    if (!run) {
      process.stdout.write(this.ui.error(`Run not found: ${runId}`));
      return;
    }

    if (['completed', 'cancelled', 'failed'].includes(run.status)) {
      process.stdout.write(this.ui.warning(`Run ${runId} is already ${run.status}.`));
      return;
    }

    this.dispatcher.requestCancel(runId);
    const cancelled: SwarmRun = {
      ...run,
      status: 'cancelled',
      endedAt: new Date().toISOString(),
      tasks: run.tasks.map((task) => (
        ['completed', 'integrated', 'failed', 'cancelled'].includes(task.status)
          ? task
          : { ...task, status: 'cancelled', endedAt: new Date().toISOString() }
      )),
    };
    await this.store.saveRun(cancelled);
    process.stdout.write(this.ui.success(`Swarm run ${runId} cancelled.`));
  }

  private async resolveRun(runId?: string): Promise<SwarmRun | null> {
    if (runId) {
      const run = await this.store.getRun(runId);
      if (!run) {
        process.stdout.write(this.ui.error(`Run not found: ${runId}`));
        return null;
      }
      return run;
    }

    const runs = await this.store.listRuns(process.cwd(), 1);
    if (runs.length === 0) {
      process.stdout.write(this.ui.error('No swarm runs found. Approve a plan first.'));
      return null;
    }
    return runs[0];
  }

  private async resolvePlan(planId?: string): Promise<SwarmPlan | null> {
    if (planId) {
      const plan = await this.store.getPlan(planId);
      if (!plan) {
        process.stdout.write(this.ui.error(`Plan not found: ${planId}`));
        return null;
      }
      return plan;
    }

    const plans = await this.store.listPlans(process.cwd(), 1);
    if (plans.length === 0) {
      process.stdout.write(this.ui.error('No swarm plans found. Run /swarm plan <prompt> first.'));
      return null;
    }
    return plans[0];
  }

  printHelp(): void {
    process.stdout.write(this.ui.panel({
      title: 'Agent Swarm',
      subtitle: 'parallel implementation with approved contracts',
      sections: [{
        title: 'Commands',
        lines: [
          `${colorize('/swarm plan <prompt>', 'cyan')}  generate a draft Swarm Plan`,
          `${colorize('/swarm status', 'cyan')}  list recent plans and runs`,
          `${colorize('/swarm show <id>', 'cyan')}  inspect a plan or run`,
          `${colorize('/swarm approve [plan-id]', 'cyan')}  approve the latest or given plan`,
          `${colorize('/swarm run [--dry-run] [run-id]', 'cyan')}  execute workers in worktrees`,
          `${colorize('/swarm workers [run-id]', 'cyan')}  list worker task runs`,
          `${colorize('/swarm integrate [run-id]', 'cyan')}  apply worker patches (apply_safe/manual)`,
          `${colorize('/swarm cancel <run-id>', 'cyan')}  cancel a swarm run`,
        ],
      }],
      footer: 'With /bridge active, plans inherit bridge:<provider> and cap workers by provider concurrency.',
    }));
  }
}
