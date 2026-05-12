import { Injectable, Optional } from '@nestjs/common';
import * as path from 'node:path';
import { BenchmarkDefinitionService } from '../../benchmark/services/benchmark-definition.service';
import { BenchmarkPlatformSyncService } from '../../benchmark/services/benchmark-platform-sync.service';
import { BenchmarkRunnerService } from '../../benchmark/services/benchmark-runner.service';
import { BenchmarkStoreService } from '../../benchmark/services/benchmark-store.service';
import type { BenchmarkDefinition } from '../../benchmark/types';
import {
  DueScheduleRunResult,
  ScheduleDefinition,
  ScheduleRun,
  ScheduleRunResult,
} from '../types';
import { SchedulePolicyService } from './schedule-policy.service';
import { ScheduleStoreService } from './schedule-store.service';
import { SandboxManagerService } from '../../sandbox/services/sandbox-manager.service';
import type { SandboxRunOptions } from '../../sandbox/types';

@Injectable()
export class ScheduleRunnerService {
  constructor(
    private readonly store: ScheduleStoreService,
    private readonly policy: SchedulePolicyService,
    private readonly benchmarkStore: BenchmarkStoreService,
    private readonly benchmarkDefinitions: BenchmarkDefinitionService,
    private readonly benchmarkRunner: BenchmarkRunnerService,
    @Optional()
    private readonly benchmarkSync?: BenchmarkPlatformSyncService,
    @Optional()
    private readonly sandbox?: SandboxManagerService,
  ) {}

  async runSchedule(
    scheduleId: string,
    options: { manual?: boolean; unattended?: boolean; now?: Date } = {},
  ): Promise<ScheduleRunResult> {
    const schedule = await this.store.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }
    return this.run(schedule, options);
  }

  async runDue(projectRoot: string, now: Date = new Date()): Promise<DueScheduleRunResult> {
    const schedules = await this.store.listDue(projectRoot, now);
    const runs: ScheduleRunResult[] = [];
    for (const schedule of schedules) {
      runs.push(await this.run(schedule, { now, unattended: true }));
    }
    return {
      checkedAt: now.toISOString(),
      runs,
    };
  }

  private async run(
    schedule: ScheduleDefinition,
    options: { manual?: boolean; unattended?: boolean; now?: Date },
  ): Promise<ScheduleRunResult> {
    const startedAt = options.now ?? new Date();
    let run = await this.store.createRun(schedule, options.manual ? undefined : schedule.nextRunAt);

    try {
      const benchmark = schedule.target.type === 'benchmark'
        ? await this.getBenchmark(schedule)
        : null;
      const decision = this.policy.assess(schedule, {
        benchmark,
        unattended: options.unattended ?? !options.manual,
      });
      if (!decision.allowed) {
        run = await this.finish(run, 'blocked', {
          error: decision.reason ?? 'Schedule blocked by policy.',
          metadata: { policySeverity: decision.severity },
        });
        await this.advanceSchedule(schedule, options.manual === true, startedAt);
        return { schedule, run };
      }

      run = await this.store.updateRun(run, {
        status: 'running',
        metadata: {
          policySeverity: decision.severity,
          policyReason: decision.reason,
        },
      });

      const result = await this.withTimeout(
        () => this.executeTargetInSandbox(schedule, run, benchmark),
        schedule.maxRuntimeMs,
      );

      if (result.type === 'benchmark') {
        run = await this.finish(run, result.benchmarkRun.status === 'completed' ? 'completed' : 'failed', {
          summary: result.benchmarkRun.summary as Record<string, unknown> | undefined,
          benchmarkRunId: result.benchmarkRun.id,
          error: result.benchmarkRun.error,
          metadata: {
            benchmarkDefinitionId: result.definition.id,
            artifactDir: result.benchmarkRun.artifactDir,
          },
        });
        await this.syncBenchmark(result.definition, result.benchmarkRun);
        await this.advanceSchedule(schedule, options.manual === true, startedAt);
        return { schedule, run, benchmarkRun: result.benchmarkRun };
      }

      run = await this.finish(run, 'completed', {
        summary: result.summary,
        metadata: result.metadata,
      });
      await this.advanceSchedule(schedule, options.manual === true, startedAt);
      return { schedule, run };
    } catch (error) {
      const status = error instanceof ScheduleTimeoutError ? 'timeout' : 'failed';
      run = await this.finish(run, status, {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.advanceSchedule(schedule, options.manual === true, startedAt);
      return { schedule, run };
    }
  }

  private async executeTarget(schedule: ScheduleDefinition, benchmark: BenchmarkDefinition | null): Promise<
    | { type: 'benchmark'; definition: BenchmarkDefinition; benchmarkRun: Awaited<ReturnType<BenchmarkRunnerService['runDefinition']>> }
    | { type: 'summary'; summary: Record<string, unknown>; metadata?: Record<string, unknown> }
  > {
    if (schedule.target.type === 'benchmark') {
      if (!benchmark) {
        throw new Error(`Benchmark definition not found: ${schedule.target.ref ?? '(missing ref)'}`);
      }
      const definition = this.benchmarkDefinitions.validateDefinition({
        ...benchmark,
        budget: schedule.budget ?? benchmark.budget,
        environmentId: schedule.environmentId ?? benchmark.environmentId,
        sandbox: { mode: 'none' },
      });
      return {
        type: 'benchmark',
        definition,
        benchmarkRun: await this.benchmarkRunner.runDefinition(definition),
      };
    }

    if (schedule.target.type === 'environment_task') {
      const definition = this.benchmarkDefinitions.validateDefinition(this.environmentTaskBenchmark(schedule));
      return {
        type: 'benchmark',
        definition,
        benchmarkRun: await this.benchmarkRunner.runDefinition(definition),
      };
    }

    if (schedule.target.type === 'agent_prompt' || schedule.target.type === 'report') {
      const definition = this.benchmarkDefinitions.validateDefinition(this.agentPromptBenchmark(schedule));
      return {
        type: 'benchmark',
        definition,
        benchmarkRun: await this.benchmarkRunner.runDefinition(definition),
      };
    }

    if (schedule.target.type === 'rag_refresh') {
      return {
        type: 'summary',
        summary: {
          refreshed: false,
          dryRun: schedule.approvalPolicy === 'dry-run-only',
          source: schedule.target.ref ?? schedule.target.config.source ?? 'project-memory',
        },
        metadata: {
          adapter: 'rag_refresh',
          note: 'RAG refresh scheduler hook recorded locally; platform refresh adapter can consume this run.',
        },
      };
    }

    throw new Error('Shell command execution is intentionally disabled for local schedules in this phase.');
  }

  private async executeTargetInSandbox(
    schedule: ScheduleDefinition,
    run: ScheduleRun,
    benchmark: BenchmarkDefinition | null,
  ): Promise<Awaited<ReturnType<ScheduleRunnerService['executeTarget']>>> {
    if (!this.sandbox) {
      return this.executeTarget(schedule, benchmark);
    }

    const sandboxResult = await this.sandbox.run({
      runId: run.id,
      projectRoot: schedule.projectRoot,
      artifactDir: path.join(schedule.projectRoot, '.cast', 'schedules', run.id),
      ...this.sandboxOptionsForSchedule(schedule, benchmark),
    }, () => this.executeTarget(schedule, benchmark));
    return sandboxResult.value;
  }

  private sandboxOptionsForSchedule(
    schedule: ScheduleDefinition,
    benchmark: BenchmarkDefinition | null,
  ): Pick<SandboxRunOptions, 'config' | 'requestedMode' | 'fallbackReason'> {
    const config = schedule.sandbox;
    const requestedMode = config?.mode;
    const usesHostAgentRoot = schedule.target.type === 'environment_task'
      || schedule.target.type === 'agent_prompt'
      || schedule.target.type === 'report'
      || benchmark?.target.type === 'agent_workflow'
      || benchmark?.target.type === 'environment_task';
    if ((requestedMode === 'git-worktree' || requestedMode === 'docker') && usesHostAgentRoot) {
      return {
        config: { ...config, mode: 'snapshot' },
        requestedMode,
        fallbackReason: `${requestedMode} sandbox is not used for host-scoped agent schedules; using snapshot rollback instead.`,
      };
    }
    return { config };
  }

  private async getBenchmark(schedule: ScheduleDefinition): Promise<BenchmarkDefinition | null> {
    const id = schedule.target.ref ?? String(schedule.target.config.definitionId ?? '');
    if (!id) {
      return null;
    }
    return this.benchmarkStore.getDefinition(id);
  }

  private environmentTaskBenchmark(schedule: ScheduleDefinition): BenchmarkDefinition {
    const now = new Date().toISOString();
    const task = String(schedule.target.config.task ?? schedule.target.ref ?? schedule.name);
    const input = String(schedule.target.config.input ?? task);
    const expected = typeof schedule.target.config.expected === 'string'
      ? schedule.target.config.expected
      : undefined;

    return {
      id: `schedule-${schedule.id}-environment-task`,
      projectRoot: schedule.projectRoot,
      name: `${schedule.name} environment task`,
      description: schedule.description ?? `Scheduled environment task for ${schedule.environmentId ?? 'active'} environment.`,
      target: {
        type: 'environment_task',
        config: {
          environmentId: schedule.environmentId ?? schedule.target.config.environmentId ?? 'active',
          task,
          prompt: schedule.target.config.prompt,
        },
      },
      environmentId: schedule.environmentId,
      cases: [{
        id: 'case-1',
        input,
        expected,
      }],
      graders: expected
        ? [{ id: 'expected-output', type: 'string_check', config: { value: expected, caseSensitive: false } }]
        : [],
      budget: schedule.budget ?? {
        maxCases: 1,
        maxCostUsd: 0.25,
        maxTokens: 20_000,
        allowLlmJudge: false,
      },
      sandbox: { mode: 'none' },
      tags: ['scheduled', schedule.environmentId ?? 'environment-task'].filter(Boolean),
      createdAt: now,
      updatedAt: now,
    };
  }

  private agentPromptBenchmark(schedule: ScheduleDefinition): BenchmarkDefinition {
    const now = new Date().toISOString();
    const prompt = String(schedule.target.config.prompt ?? schedule.target.ref ?? schedule.name);
    const input = String(schedule.target.config.input ?? prompt);
    const expected = typeof schedule.target.config.expected === 'string'
      ? schedule.target.config.expected
      : undefined;

    return {
      id: `schedule-${schedule.id}-agent-prompt`,
      projectRoot: schedule.projectRoot,
      name: `${schedule.name} agent prompt`,
      description: schedule.description ?? 'Scheduled Cast agent prompt.',
      target: {
        type: 'agent_workflow',
        config: {
          prompt,
        },
      },
      environmentId: schedule.environmentId,
      cases: [{
        id: 'case-1',
        input,
        expected,
      }],
      graders: expected
        ? [{ id: 'expected-output', type: 'string_check', config: { value: expected, caseSensitive: false } }]
        : [],
      budget: schedule.budget ?? {
        maxCases: 1,
        maxCostUsd: 0.5,
        maxTokens: 20_000,
        allowLlmJudge: false,
      },
      sandbox: { mode: 'none' },
      tags: ['scheduled', schedule.target.type, ...(schedule.tags ?? [])],
      createdAt: now,
      updatedAt: now,
    };
  }

  private async finish(
    run: ScheduleRun,
    status: ScheduleRun['status'],
    patch: Partial<Omit<ScheduleRun, 'id' | 'scheduleId' | 'projectRoot' | 'startedAt' | 'status'>>,
  ): Promise<ScheduleRun> {
    return this.store.updateRun(run, {
      ...patch,
      status,
      completedAt: new Date().toISOString(),
    });
  }

  private async advanceSchedule(schedule: ScheduleDefinition, manual: boolean, runAt: Date): Promise<void> {
    if (manual) {
      await this.store.recordManualRun(schedule, runAt);
      return;
    }
    await this.store.markTriggered(schedule, runAt);
  }

  private async syncBenchmark(definition: BenchmarkDefinition, run: Awaited<ReturnType<BenchmarkRunnerService['runDefinition']>>): Promise<void> {
    try {
      await this.benchmarkSync?.syncCompletedRun(definition, run);
    } catch {
      // Benchmark sync already has its own pending queue; scheduler runs should not fail on platform outages.
    }
  }

  private async withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const operationPromise = operation();
    try {
      return await Promise.race([
        operationPromise,
        new Promise<T>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new ScheduleTimeoutError(timeoutMs)), timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof ScheduleTimeoutError) {
        operationPromise.catch(() => undefined);
      }
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

class ScheduleTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Schedule exceeded max runtime of ${timeoutMs}ms.`);
    this.name = 'ScheduleTimeoutError';
  }
}
