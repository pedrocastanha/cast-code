import { Injectable, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SandboxCommandRunnerService } from '../../sandbox/services/sandbox-command-runner.service';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import type { TraceEventType } from '../../trace/types/trace.types';
import type {
  SwarmIntegrationMode,
  SwarmPlan,
  SwarmRun,
  SwarmTaskIntegrationResult,
  SwarmTaskPlan,
  SwarmTaskRun,
} from '../types';
import { SwarmOwnershipService } from './swarm-ownership.service';
import { SwarmRunStoreService } from './swarm-run-store.service';
import { SwarmWorktreeService } from './swarm-worktree.service';

export interface SwarmIntegrateOptions {
  taskIds?: string[];
  force?: boolean;
}

export interface SwarmIntegrationSummary {
  applied: number;
  manualReview: number;
  conflicts: number;
  violations: number;
  skipped: number;
  finalVerification: Array<{ command: string; status: 'passed' | 'failed'; outputPreview?: string }>;
}

@Injectable()
export class SwarmIntegrationService {
  constructor(
    private readonly store: SwarmRunStoreService,
    private readonly worktree: SwarmWorktreeService,
    private readonly ownership: SwarmOwnershipService,
    private readonly commands: SandboxCommandRunnerService,
    @Optional() private readonly traceWriter?: TraceWriterService,
    @Optional() private readonly traceContext?: TraceContextService,
  ) {}

  async integrateRun(runId: string, options: SwarmIntegrateOptions = {}): Promise<{ run: SwarmRun; summary: SwarmIntegrationSummary }> {
    const run = await this.store.getRun(runId);
    if (!run) {
      throw new Error(`Swarm run not found: ${runId}`);
    }

    const plan = await this.store.getPlan(run.planId);
    if (!plan) {
      throw new Error(`Swarm plan not found for run ${runId}`);
    }

    const integrating: SwarmRun = { ...run, status: 'integrating' };
    await this.store.saveRun(integrating);

    const summary: SwarmIntegrationSummary = {
      applied: 0,
      manualReview: 0,
      conflicts: 0,
      violations: 0,
      skipped: 0,
      finalVerification: [],
    };

    const integratedPaths = new Set<string>();
    const taskMap = new Map(plan.tasks.map((task) => [task.id, task]));
    const eligible = run.tasks.filter((task) => this.isEligibleForIntegration(task, options.taskIds));

    for (const taskRun of eligible) {
      const planTask = taskMap.get(taskRun.planTaskId);
      if (!planTask || !taskRun.worktreePath) {
        summary.skipped += 1;
        continue;
      }

      const result = await this.integrateTask({
        run,
        plan,
        planTask,
        taskRun,
        mode: run.integrationMode,
        integratedPaths,
        force: options.force,
      });

      taskRun.integration = result;
      if (result.status === 'applied') {
        taskRun.status = 'integrated';
        for (const changed of result.changedPaths) {
          integratedPaths.add(changed);
        }
        summary.applied += 1;
        this.emitTrace('swarm.integration.applied', { runId, taskId: planTask.id, paths: result.changedPaths.length });
      } else if (result.status === 'conflict') {
        summary.conflicts += 1;
        this.emitTrace('swarm.integration.manual_review_required', { runId, taskId: planTask.id, reason: 'conflict' });
      } else if (result.status === 'contract_violation') {
        summary.violations += 1;
        this.emitTrace('swarm.integration.manual_review_required', { runId, taskId: planTask.id, reason: 'contract_violation' });
      } else {
        summary.manualReview += 1;
        this.emitTrace('swarm.integration.manual_review_required', { runId, taskId: planTask.id, reason: result.status });
      }
    }

    integrating.tasks = run.tasks.map((task) => eligible.find((entry) => entry.id === task.id) ?? task);
    summary.finalVerification = await this.runFinalVerification(plan, run.projectRoot);

    const verificationFailed = summary.finalVerification.some((step) => step.status === 'failed');
    integrating.status = verificationFailed || summary.conflicts > 0 || summary.violations > 0
      ? 'failed'
      : 'completed';
    integrating.endedAt = new Date().toISOString();

    const saved = await this.store.saveRun(integrating);
    if (saved.status === 'completed') {
      this.emitTrace('swarm.run.completed', { runId, applied: summary.applied, manualReview: summary.manualReview });
    }

    return { run: saved, summary };
  }

  private isEligibleForIntegration(task: SwarmTaskRun, taskIds?: string[]): boolean {
    if (taskIds && !taskIds.includes(task.planTaskId)) {
      return false;
    }
    return ['completed', 'integrated'].includes(task.status) && Boolean(task.worktreePath);
  }

  private async integrateTask(input: {
    run: SwarmRun;
    plan: SwarmPlan;
    planTask: SwarmTaskPlan;
    taskRun: SwarmTaskRun;
    mode: SwarmIntegrationMode;
    integratedPaths: Set<string>;
    force?: boolean;
  }): Promise<SwarmTaskIntegrationResult> {
    const capture = await this.worktree.captureDiff(input.taskRun.worktreePath);
    const changedPaths = capture.changedFiles;

    if (changedPaths.length === 0) {
      return { status: 'skipped', changedPaths: [], message: 'No changes to integrate.' };
    }

    const violationPaths = changedPaths.filter((file) =>
      !this.ownership.matchesOwnership(file, input.planTask.fileOwnership),
    );
    if (violationPaths.length > 0) {
      return {
        status: 'contract_violation',
        changedPaths,
        violationPaths,
        message: 'Changed files outside approved ownership.',
      };
    }

    const crossTaskConflicts = changedPaths.filter((file) => input.integratedPaths.has(file));
    if (crossTaskConflicts.length > 0) {
      return {
        status: 'conflict',
        changedPaths,
        conflictPaths: crossTaskConflicts,
        message: 'Changes overlap with another integrated worker task.',
      };
    }

    if (input.taskRun.handoff?.blockers?.length) {
      return {
        status: 'manual_review_required',
        changedPaths,
        message: input.taskRun.handoff.blockers.join('; '),
      };
    }

    if (input.taskRun.handoff?.expansionRequests?.length) {
      return {
        status: 'manual_review_required',
        changedPaths,
        message: 'Worker requested scope expansion before integration.',
      };
    }

    const failedChecks = (input.taskRun.handoff?.testsRun ?? []).filter((test) => test.status === 'failed');
    if (failedChecks.length > 0 && input.mode === 'apply_safe') {
      return {
        status: 'manual_review_required',
        changedPaths,
        message: `Focused verification failed: ${failedChecks.map((test) => test.command).join(', ')}`,
      };
    }

    if (input.mode === 'manual') {
      return {
        status: 'manual_review_required',
        changedPaths,
        message: 'Integration mode is manual. Review worktree diff and apply explicitly.',
      };
    }

    const secretPaths = await this.findSecretLikePaths(input.taskRun.worktreePath, changedPaths);
    if (secretPaths.length > 0) {
      return {
        status: 'manual_review_required',
        changedPaths,
        violationPaths: secretPaths,
        message: 'Potential secret or sensitive config detected in worker changes.',
      };
    }

    const applyResult = await this.applyChanges({
      projectRoot: input.run.projectRoot,
      workspaceRoot: input.run.workspaceRoot,
      worktreePath: input.taskRun.worktreePath,
      changedPaths,
      untrackedPaths: capture.untrackedFiles,
      patch: capture.diff,
      mode: input.mode,
      force: input.force,
    });

    if (!applyResult.ok) {
      return {
        status: applyResult.conflict ? 'conflict' : 'manual_review_required',
        changedPaths,
        conflictPaths: applyResult.conflictPaths,
        message: applyResult.message,
      };
    }

    return {
      status: 'applied',
      changedPaths,
      message: applyResult.message,
    };
  }

  private async applyChanges(input: {
    projectRoot: string;
    workspaceRoot: string;
    worktreePath: string;
    changedPaths: string[];
    untrackedPaths: string[];
    patch: string;
    mode: SwarmIntegrationMode;
    force?: boolean;
  }): Promise<{ ok: boolean; conflict?: boolean; conflictPaths?: string[]; message?: string }> {
    const gitRoot = await this.gitRoot(input.projectRoot);
    if (!gitRoot) {
      return { ok: false, message: 'Integration requires a git repository.' };
    }

    if (input.patch.trim() && !input.force) {
      const patchFile = path.join(os.tmpdir(), `cast-swarm-${crypto.randomUUID()}.patch`);
      try {
        await fs.writeFile(patchFile, input.patch, 'utf-8');
        const check = await this.commands.run('git', ['-C', gitRoot, 'apply', '--check', patchFile]);
        if (check.exitCode !== 0) {
          return {
            ok: false,
            conflict: true,
            message: check.stderr || check.stdout || 'Patch does not apply cleanly to the main workspace.',
          };
        }
        const apply = await this.commands.run('git', ['-C', gitRoot, 'apply', patchFile]);
        if (apply.exitCode !== 0) {
          return {
            ok: false,
            conflict: true,
            message: apply.stderr || apply.stdout || 'Failed to apply worker patch.',
          };
        }
        const copied = await this.copyUntrackedFiles(input);
        return {
          ok: true,
          message: `Applied patch with ${input.changedPaths.length} path(s)${copied > 0 ? ` and ${copied} new file(s)` : ''}.`,
        };
      } finally {
        await fs.unlink(patchFile).catch(() => undefined);
      }
    }

    const copied = await this.copyUntrackedFiles({
      projectRoot: input.projectRoot,
      workspaceRoot: input.workspaceRoot,
      worktreePath: input.worktreePath,
      untrackedPaths: input.changedPaths,
    });

    return { ok: true, message: `Copied ${copied} file(s) into the main workspace.` };
  }

  private async copyUntrackedFiles(input: {
    projectRoot: string;
    workspaceRoot: string;
    worktreePath: string;
    untrackedPaths: string[];
  }): Promise<number> {
    let copied = 0;
    for (const relativePath of input.untrackedPaths) {
      const target = this.resolveTargetPath(input.projectRoot, input.workspaceRoot, relativePath);
      if (!target) {
        throw new Error(`Unable to resolve target path for ${relativePath}`);
      }
      if (!this.isInsideWorkspace(target, input.workspaceRoot)) {
        throw new Error(`Refusing to write outside workspace: ${relativePath}`);
      }

      const source = path.join(input.worktreePath, relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
      copied += 1;
    }
    return copied;
  }

  private resolveTargetPath(projectRoot: string, workspaceRoot: string, relativePath: string): string | null {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
    const candidates = [
      path.resolve(projectRoot, normalized),
      path.resolve(workspaceRoot, normalized),
      path.resolve(projectRoot, normalized.replace(/^\.\.\//, '')),
    ];

    for (const candidate of candidates) {
      if (this.isInsideWorkspace(candidate, workspaceRoot) || this.isInsideWorkspace(candidate, projectRoot)) {
        return candidate;
      }
    }
    return path.resolve(projectRoot, normalized);
  }

  private isInsideWorkspace(candidate: string, workspaceRoot: string): boolean {
    const workspace = path.resolve(workspaceRoot);
    const resolved = path.resolve(candidate);
    return resolved === workspace || resolved.startsWith(workspace + path.sep);
  }

  private async findSecretLikePaths(worktreePath: string, changedPaths: string[]): Promise<string[]> {
    const suspicious: string[] = [];
    const secretPattern = /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i;

    for (const relativePath of changedPaths) {
      if (/\.env/i.test(relativePath) || /\.pem$/i.test(relativePath)) {
        suspicious.push(relativePath);
        continue;
      }
      try {
        const content = await fs.readFile(path.join(worktreePath, relativePath), 'utf-8');
        if (secretPattern.test(content)) {
          suspicious.push(relativePath);
        }
      } catch {
        // ignore unreadable/binary files
      }
    }
    return suspicious;
  }

  private async runFinalVerification(plan: SwarmPlan, projectRoot: string): Promise<SwarmIntegrationSummary['finalVerification']> {
    const results: SwarmIntegrationSummary['finalVerification'] = [];
    for (const step of plan.finalVerification) {
      const result = await this.commands.run('bash', ['-lc', step.command], { cwd: projectRoot });
      results.push({
        command: step.command,
        status: result.exitCode === 0 ? 'passed' : 'failed',
        outputPreview: (result.stderr || result.stdout).slice(0, 240),
      });
    }
    return results;
  }

  private async gitRoot(projectRoot: string): Promise<string | null> {
    const result = await this.commands.run('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel']);
    if (result.exitCode !== 0) {
      return null;
    }
    return result.stdout.trim();
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
