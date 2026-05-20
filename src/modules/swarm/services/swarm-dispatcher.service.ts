import { Injectable, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import type { TraceEventType } from '../../trace/types/trace.types';
import type { SwarmDispatchOptions, SwarmPlan, SwarmRun, SwarmTaskPlan, SwarmTaskRun, SwarmWorkerRunInput } from '../types';
import { SwarmIntegrationService } from './swarm-integration.service';
import { SwarmRunStoreService } from './swarm-run-store.service';
import { SwarmWorkerRuntimeService } from './swarm-worker-runtime.service';
import { SwarmWorktreeService } from './swarm-worktree.service';

@Injectable()
export class SwarmDispatcherService {
  private readonly cancelRequested = new Set<string>();

  constructor(
    private readonly store: SwarmRunStoreService,
    private readonly worktree: SwarmWorktreeService,
    private readonly workerRuntime: SwarmWorkerRuntimeService,
    @Optional() private readonly integration?: SwarmIntegrationService,
    @Optional() private readonly traceWriter?: TraceWriterService,
    @Optional() private readonly traceContext?: TraceContextService,
  ) {}

  requestCancel(runId: string): void {
    this.cancelRequested.add(runId);
  }

  isCancelRequested(runId: string): boolean {
    return this.cancelRequested.has(runId);
  }

  async dispatch(options: SwarmDispatchOptions): Promise<SwarmRun> {
    let run = await this.store.getRun(options.runId);
    if (!run) {
      throw new Error(`Swarm run not found: ${options.runId}`);
    }

    const plan = await this.store.getPlan(run.planId);
    if (!plan) {
      throw new Error(`Swarm plan not found for run ${options.runId}`);
    }
    if (plan.status !== 'approved') {
      throw new Error(`Swarm plan ${plan.id} must be approved before execution.`);
    }

    const maxConcurrent = options.maxConcurrent ?? plan.globalConstraints.maxWorkers ?? 1;
    const active = { run: await this.transitionRun(run, 'preparing') };
    active.run = await this.transitionRun(active.run, 'running');
    this.emitTrace('swarm.run.started', { runId: active.run.id, dryRun: Boolean(options.dryRun), maxConcurrent });

    const completed = new Set<string>();
    const failed = new Set<string>();
    const inFlight = new Map<string, Promise<void>>();

    const isRunnable = (task: SwarmTaskPlan) =>
      task.dependsOn.every((dep) => completed.has(dep))
      && !failed.has(task.id)
      && !completed.has(task.id);

    while (completed.size + failed.size < plan.tasks.length) {
      if (this.isCancelRequested(active.run.id)) {
        active.run = await this.cancelRun(active.run);
        break;
      }

      const runnable = plan.tasks.filter((task) => isRunnable(task) && !inFlight.has(task.id));
      for (const planTask of runnable) {
        if (inFlight.size >= maxConcurrent) break;
        const promise = this.executeTask(active.run, plan, planTask, options.dryRun)
          .then((taskRun) => {
            active.run.tasks = active.run.tasks.map((existing) => existing.id === taskRun.id ? taskRun : existing);
            if (taskRun.status === 'completed') {
              completed.add(planTask.id);
            } else {
              failed.add(planTask.id);
            }
          })
          .finally(() => {
            inFlight.delete(planTask.id);
          });
        inFlight.set(planTask.id, promise);
      }

      if (inFlight.size === 0) {
        const blocked = plan.tasks.filter((task) => !completed.has(task.id) && !failed.has(task.id));
        for (const task of blocked) {
          failed.add(task.id);
          active.run.tasks = active.run.tasks.map((taskRun) =>
            taskRun.planTaskId === task.id && !['completed', 'failed', 'cancelled', 'integrated'].includes(taskRun.status)
              ? { ...taskRun, status: 'blocked', endedAt: new Date().toISOString() }
              : taskRun,
          );
        }
        break;
      }

      await Promise.race(inFlight.values());
      active.run = await this.store.saveRun(active.run);
    }

    await Promise.all(inFlight.values());

    const hasCompletedTasks = active.run.tasks.some((task) => task.status === 'completed');
    if (
      !options.dryRun
      && this.integration
      && hasCompletedTasks
      && active.run.integrationMode !== 'manual'
      && !this.isCancelRequested(active.run.id)
    ) {
      const integrated = await this.integration.integrateRun(active.run.id);
      active.run = integrated.run;
      return active.run;
    }

    if (!this.isCancelRequested(active.run.id)) {
      const terminalStatus = failed.size > 0 ? 'failed' : 'completed';
      active.run = await this.transitionRun(active.run, terminalStatus);
      this.emitTrace(terminalStatus === 'completed' ? 'swarm.run.completed' : 'swarm.task.failed', {
        runId: active.run.id,
        completed: completed.size,
        failed: failed.size,
      });
    }
    this.cancelRequested.delete(active.run.id);
    return active.run;
  }

  private async executeTask(
    run: SwarmRun,
    plan: SwarmPlan,
    planTask: SwarmTaskPlan,
    dryRun?: boolean,
  ): Promise<SwarmTaskRun> {
    const existing = run.tasks.find((task) => task.planTaskId === planTask.id);
    let taskRun: SwarmTaskRun = existing ?? {
      id: crypto.randomUUID(),
      planTaskId: planTask.id,
      status: 'queued',
      workerId: planTask.worker.id,
      worktreePath: '',
      branchName: `cast/swarm/${run.id}/${planTask.id}`,
    };

    taskRun = { ...taskRun, status: 'preparing' };
    run.tasks = run.tasks.some((task) => task.id === taskRun.id)
      ? run.tasks.map((task) => task.id === taskRun.id ? taskRun : task)
      : [...run.tasks, taskRun];
    await this.store.saveRun(run);

    const worktree = await this.worktree.create({
      runId: run.id,
      taskId: planTask.id,
      projectRoot: run.projectRoot,
      workspaceRoot: run.workspaceRoot,
    });

    const workerInput: SwarmWorkerRunInput = {
      plan,
      planTask,
      taskRun,
      worktree,
      permission: this.workerRuntime.buildPermissionContext({
        plan,
        planTask,
        taskRun,
        worktree,
      }),
      dryRun,
      onOutput: (chunk) => {
        process.stdout.write(chunk);
      },
    };

    const result = await this.workerRuntime.execute(workerInput);
    run.tasks = run.tasks.map((task) => task.id === result.taskRun.id ? result.taskRun : task);
    await this.store.saveRun(run);
    return result.taskRun;
  }

  private async transitionRun(run: SwarmRun, status: SwarmRun['status']): Promise<SwarmRun> {
    const now = new Date().toISOString();
    const next: SwarmRun = {
      ...run,
      status,
      startedAt: run.startedAt ?? (status === 'running' ? now : run.startedAt),
      endedAt: ['completed', 'failed', 'cancelled'].includes(status) ? now : run.endedAt,
    };
    return this.store.saveRun(next);
  }

  private async cancelRun(run: SwarmRun): Promise<SwarmRun> {
    const next: SwarmRun = {
      ...run,
      status: 'cancelled',
      endedAt: new Date().toISOString(),
      tasks: run.tasks.map((task) => (
        ['completed', 'failed', 'integrated', 'cancelled'].includes(task.status)
          ? task
          : { ...task, status: 'cancelled', endedAt: new Date().toISOString() }
      )),
    };
    return this.store.saveRun(next);
  }

  private emitTrace(type: TraceEventType, payload: Record<string, unknown>): void {
    try {
      const context = this.traceContext?.getCurrent();
      if (!context || !this.traceWriter) return;
      this.traceWriter.append({
        eventId: crypto.randomUUID(),
        sessionId: context.sessionId,
        runId: context.rootRunId,
        type,
        payload,
      });
    } catch {
      // best-effort
    }
  }
}
