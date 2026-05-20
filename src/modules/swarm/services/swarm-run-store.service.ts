import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { StateDbService } from '../../state/services/state-db.service';
import type { CreateSwarmPlanInput, SwarmPlan, SwarmRun, SwarmTaskRun } from '../types';

@Injectable()
export class SwarmRunStoreService {
  constructor(private readonly dbService: StateDbService) {}

  async savePlan(input: CreateSwarmPlanInput | SwarmPlan): Promise<SwarmPlan> {
    const now = new Date().toISOString();
    const existing = this.isPlan(input) ? input : undefined;
    const plan: SwarmPlan = existing ?? {
      id: crypto.randomUUID(),
      projectRoot: input.projectRoot ?? process.cwd(),
      workspaceRoot: input.workspaceRoot ?? input.projectRoot ?? process.cwd(),
      goal: input.goal,
      reasonForSwarm: '',
      status: 'draft',
      integrationMode: input.integrationMode ?? 'apply_safe',
      runtimePolicy: input.runtimePolicy ?? { kind: 'default' },
      globalConstraints: {
        maxWorkers: input.globalConstraints?.maxWorkers ?? 4,
        maxRuntimeMsPerTask: input.globalConstraints?.maxRuntimeMsPerTask,
        denyPaths: input.globalConstraints?.denyPaths,
      },
      tasks: [],
      finalVerification: [],
      createdAt: now,
    };

    await this.dbService.executeWrite((db) => {
      db.prepare(`
        insert into swarm_plans (
          id, project_root, workspace_root, goal, reason_for_swarm, status,
          integration_mode, runtime_policy_json, global_constraints_json,
          tasks_json, final_verification_json, plan_json, created_at, approved_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          project_root = excluded.project_root,
          workspace_root = excluded.workspace_root,
          goal = excluded.goal,
          reason_for_swarm = excluded.reason_for_swarm,
          status = excluded.status,
          integration_mode = excluded.integration_mode,
          runtime_policy_json = excluded.runtime_policy_json,
          global_constraints_json = excluded.global_constraints_json,
          tasks_json = excluded.tasks_json,
          final_verification_json = excluded.final_verification_json,
          plan_json = excluded.plan_json,
          approved_at = excluded.approved_at
      `).run(
        plan.id,
        plan.projectRoot,
        plan.workspaceRoot,
        plan.goal,
        plan.reasonForSwarm,
        plan.status,
        plan.integrationMode,
        JSON.stringify(plan.runtimePolicy),
        JSON.stringify(plan.globalConstraints),
        JSON.stringify(plan.tasks),
        JSON.stringify(plan.finalVerification),
        JSON.stringify(plan),
        plan.createdAt,
        plan.approvedAt ?? null,
      );
    });

    return plan;
  }

  async getPlan(id: string): Promise<SwarmPlan | null> {
    const db = await this.dbService.getDb();
    const row = db.prepare('select plan_json from swarm_plans where id = ? limit 1').get(id) as { plan_json: string } | undefined;
    return row ? this.parseJson<SwarmPlan>(row.plan_json) : null;
  }

  async listPlans(projectRoot: string, limit = 20): Promise<SwarmPlan[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select plan_json
      from swarm_plans
      where project_root = ?
      order by created_at desc
      limit ?
    `).all(projectRoot, limit) as Array<{ plan_json: string }>;
    return rows.map((row) => this.parseJson<SwarmPlan>(row.plan_json));
  }

  async saveRun(run: SwarmRun): Promise<SwarmRun> {
    await this.dbService.executeWrite((db) => {
      db.prepare(`
        insert into swarm_runs (
          id, plan_id, project_root, workspace_root, status, integration_mode,
          runtime_policy_json, run_json, created_at, started_at, ended_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          status = excluded.status,
          runtime_policy_json = excluded.runtime_policy_json,
          run_json = excluded.run_json,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at
      `).run(
        run.id,
        run.planId,
        run.projectRoot,
        run.workspaceRoot,
        run.status,
        run.integrationMode,
        JSON.stringify(run.runtimePolicy),
        JSON.stringify(run),
        run.createdAt,
        run.startedAt ?? null,
        run.endedAt ?? null,
      );

      for (const task of run.tasks) {
        db.prepare(`
          insert into swarm_task_runs (
            id, run_id, plan_task_id, worker_id, status, worktree_path, branch_name,
            handoff_json, integration_json, task_run_json, started_at, ended_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(id) do update set
            status = excluded.status,
            handoff_json = excluded.handoff_json,
            integration_json = excluded.integration_json,
            task_run_json = excluded.task_run_json,
            started_at = excluded.started_at,
            ended_at = excluded.ended_at
        `).run(
          task.id,
          run.id,
          task.planTaskId,
          task.workerId,
          task.status,
          task.worktreePath,
          task.branchName,
          task.handoff ? JSON.stringify(task.handoff) : null,
          task.integration ? JSON.stringify(task.integration) : null,
          JSON.stringify(task),
          task.startedAt ?? null,
          task.endedAt ?? null,
        );
      }
    });

    return run;
  }

  async getRun(id: string): Promise<SwarmRun | null> {
    const db = await this.dbService.getDb();
    const row = db.prepare('select run_json from swarm_runs where id = ? limit 1').get(id) as { run_json: string } | undefined;
    if (!row) return null;
    const run = this.parseJson<SwarmRun>(row.run_json);
    const tasks = db.prepare(`
      select task_run_json from swarm_task_runs where run_id = ? order by started_at asc
    `).all(id) as Array<{ task_run_json: string }>;
    run.tasks = tasks.map((task) => this.parseJson<SwarmTaskRun>(task.task_run_json));
    return run;
  }

  async listRuns(projectRoot: string, limit = 20): Promise<SwarmRun[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select run_json from swarm_runs
      where project_root = ?
      order by created_at desc
      limit ?
    `).all(projectRoot, limit) as Array<{ run_json: string }>;
    return rows.map((row) => this.parseJson<SwarmRun>(row.run_json));
  }

  private isPlan(input: CreateSwarmPlanInput | SwarmPlan): input is SwarmPlan {
    return 'id' in input && 'status' in input;
  }

  private parseJson<T>(value: string): T {
    return JSON.parse(value) as T;
  }
}
