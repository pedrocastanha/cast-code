import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { StateDbService } from '../../state/services/state-db.service';
import {
  CreateScheduleInput,
  ScheduleDefinition,
  ScheduleRun,
  ScheduleRunStatus,
} from '../types';
import { ScheduleCronService } from './schedule-cron.service';

@Injectable()
export class ScheduleStoreService {
  constructor(
    private readonly dbService: StateDbService,
    private readonly cron: ScheduleCronService,
  ) {}

  async save(input: CreateScheduleInput | ScheduleDefinition): Promise<ScheduleDefinition> {
    const now = new Date().toISOString();
    const existing = this.isDefinition(input) ? input : undefined;
    this.cron.validate(input.cronExpression);

    const schedule: ScheduleDefinition = {
      id: input.id || crypto.randomUUID(),
      projectRoot: input.projectRoot,
      name: input.name,
      description: input.description,
      cronExpression: input.cronExpression,
      timezone: input.timezone,
      status: existing?.status ?? 'active',
      target: input.target,
      environmentId: input.environmentId,
      approvalPolicy: input.approvalPolicy ?? 'dry-run-only',
      budget: input.budget,
      sandbox: input.sandbox ?? { mode: 'snapshot' },
      maxRuntimeMs: input.maxRuntimeMs ?? input.budget?.maxRuntimeMs ?? 300_000,
      nextRunAt: existing?.nextRunAt ?? this.cron.nextRunAt(input.cronExpression).toISOString(),
      lastRunAt: existing?.lastRunAt,
      tags: input.tags ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.dbService.executeWrite((db) => {
      db.prepare(`
        insert into local_schedules (
          id, project_root, name, description, cron_expression, timezone, status,
          target_type, target_ref, target_json, environment_id, approval_policy,
          budget_json, max_runtime_ms, next_run_at, last_run_at, schedule_json,
          created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          project_root = excluded.project_root,
          name = excluded.name,
          description = excluded.description,
          cron_expression = excluded.cron_expression,
          timezone = excluded.timezone,
          status = excluded.status,
          target_type = excluded.target_type,
          target_ref = excluded.target_ref,
          target_json = excluded.target_json,
          environment_id = excluded.environment_id,
          approval_policy = excluded.approval_policy,
          budget_json = excluded.budget_json,
          max_runtime_ms = excluded.max_runtime_ms,
          next_run_at = excluded.next_run_at,
          last_run_at = excluded.last_run_at,
          schedule_json = excluded.schedule_json,
          updated_at = excluded.updated_at
      `).run(
        schedule.id,
        schedule.projectRoot,
        schedule.name,
        schedule.description ?? null,
        schedule.cronExpression,
        schedule.timezone ?? null,
        schedule.status,
        schedule.target.type,
        schedule.target.ref ?? null,
        JSON.stringify(schedule.target),
        schedule.environmentId ?? null,
        schedule.approvalPolicy,
        schedule.budget ? JSON.stringify(schedule.budget) : null,
        schedule.maxRuntimeMs,
        schedule.nextRunAt ?? null,
        schedule.lastRunAt ?? null,
        JSON.stringify(schedule),
        schedule.createdAt,
        schedule.updatedAt,
      );
    });

    return schedule;
  }

  async get(id: string): Promise<ScheduleDefinition | null> {
    const db = await this.dbService.getDb();
    const row = db.prepare('select schedule_json from local_schedules where id = ? limit 1').get(id) as { schedule_json: string } | undefined;
    return row ? this.parseJson<ScheduleDefinition>(row.schedule_json) : null;
  }

  async list(projectRoot: string): Promise<ScheduleDefinition[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select schedule_json
      from local_schedules
      where project_root = ?
      order by status asc, next_run_at asc, name asc
    `).all(projectRoot) as Array<{ schedule_json: string }>;
    return rows.map((row) => this.parseJson<ScheduleDefinition>(row.schedule_json));
  }

  async listDue(projectRoot: string, now: Date = new Date()): Promise<ScheduleDefinition[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select schedule_json
      from local_schedules
      where project_root = ?
        and status = 'active'
        and next_run_at is not null
        and next_run_at <= ?
      order by next_run_at asc
    `).all(projectRoot, now.toISOString()) as Array<{ schedule_json: string }>;
    return rows.map((row) => this.parseJson<ScheduleDefinition>(row.schedule_json));
  }

  async setStatus(id: string, status: ScheduleDefinition['status']): Promise<ScheduleDefinition | null> {
    const schedule = await this.get(id);
    if (!schedule) {
      return null;
    }

    return this.save({ ...schedule, status });
  }

  async markTriggered(schedule: ScheduleDefinition, runAt: Date = new Date()): Promise<ScheduleDefinition> {
    const nextRunAt = this.cron.nextRunAt(schedule.cronExpression, runAt).toISOString();
    return this.save({
      ...schedule,
      lastRunAt: runAt.toISOString(),
      nextRunAt,
    });
  }

  async recordManualRun(schedule: ScheduleDefinition, runAt: Date = new Date()): Promise<ScheduleDefinition> {
    return this.save({
      ...schedule,
      lastRunAt: runAt.toISOString(),
    });
  }

  async createRun(schedule: ScheduleDefinition, dueAt?: string): Promise<ScheduleRun> {
    const run: ScheduleRun = {
      id: crypto.randomUUID(),
      scheduleId: schedule.id,
      projectRoot: schedule.projectRoot,
      status: 'queued',
      startedAt: new Date().toISOString(),
      dueAt,
      targetType: schedule.target.type,
      metadata: {
        scheduleName: schedule.name,
        approvalPolicy: schedule.approvalPolicy,
      },
    };
    await this.insertRun(run);
    return run;
  }

  async updateRun(
    run: ScheduleRun,
    patch: Partial<Omit<ScheduleRun, 'id' | 'scheduleId' | 'projectRoot' | 'startedAt'>>,
  ): Promise<ScheduleRun> {
    const next: ScheduleRun = {
      ...run,
      ...patch,
      metadata: {
        ...(run.metadata ?? {}),
        ...(patch.metadata ?? {}),
      },
    };
    await this.dbService.executeWrite((db) => {
      db.prepare(`
        update local_schedule_runs
        set status = ?,
            completed_at = ?,
            due_at = ?,
            target_type = ?,
            summary_json = ?,
            error = ?,
            benchmark_run_id = ?,
            metadata_json = ?,
            run_json = ?
        where id = ?
      `).run(
        next.status,
        next.completedAt ?? null,
        next.dueAt ?? null,
        next.targetType,
        next.summary ? JSON.stringify(next.summary) : null,
        next.error ?? null,
        next.benchmarkRunId ?? null,
        next.metadata ? JSON.stringify(next.metadata) : null,
        JSON.stringify(next),
        next.id,
      );
    });
    return next;
  }

  async listRuns(scheduleId: string, limit = 20): Promise<ScheduleRun[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select run_json
      from local_schedule_runs
      where schedule_id = ?
      order by started_at desc
      limit ?
    `).all(scheduleId, limit) as Array<{ run_json: string }>;
    return rows.map((row) => this.parseJson<ScheduleRun>(row.run_json));
  }

  async listProjectRuns(projectRoot: string, limit = 50): Promise<ScheduleRun[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select run_json
      from local_schedule_runs
      where project_root = ?
      order by started_at desc
      limit ?
    `).all(projectRoot, limit) as Array<{ run_json: string }>;
    return rows.map((row) => this.parseJson<ScheduleRun>(row.run_json));
  }

  private async insertRun(run: ScheduleRun): Promise<void> {
    await this.dbService.executeWrite((db) => {
      db.prepare(`
        insert into local_schedule_runs (
          id, schedule_id, project_root, status, started_at, completed_at, due_at,
          target_type, summary_json, error, benchmark_run_id, metadata_json, run_json
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        run.id,
        run.scheduleId,
        run.projectRoot,
        run.status,
        run.startedAt,
        run.completedAt ?? null,
        run.dueAt ?? null,
        run.targetType,
        run.summary ? JSON.stringify(run.summary) : null,
        run.error ?? null,
        run.benchmarkRunId ?? null,
        run.metadata ? JSON.stringify(run.metadata) : null,
        JSON.stringify(run),
      );
    });
  }

  private isDefinition(input: CreateScheduleInput | ScheduleDefinition): input is ScheduleDefinition {
    return typeof (input as ScheduleDefinition).status === 'string';
  }

  private parseJson<T>(value: string): T {
    return JSON.parse(value) as T;
  }
}
