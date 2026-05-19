import { Injectable } from '@nestjs/common';
import type Database from 'better-sqlite3';

type Migration = {
  name: string;
  statements?: string[];
  run?: (db: Database.Database) => void;
};

@Injectable()
export class StateMigrationService {
  private readonly migrations: Migration[] = [
    {
      name: '0001_local_state_core',
      statements: [
        `create table if not exists state_meta (
          name text primary key,
          applied_at text not null
        )`,
        `create table if not exists local_sessions (
          id text primary key,
          project_root text not null,
          platform_project_id text,
          environment_id text,
          started_at text not null,
          ended_at text,
          model text,
          total_tokens integer not null default 0,
          total_cost real not null default 0
        )`,
        `create table if not exists local_messages (
          id text primary key,
          session_id text not null,
          role text not null check (role in ('user', 'assistant', 'system', 'tool')),
          content_preview text,
          content_hash text,
          redacted_content text,
          created_at text not null,
          foreign key (session_id) references local_sessions(id) on delete cascade
        )`,
        `create table if not exists local_tool_calls (
          id text primary key,
          session_id text not null,
          message_id text,
          tool_name text not null,
          input_redacted text,
          output_preview text,
          status text not null check (status in ('ok', 'error', 'denied', 'cancelled')),
          latency_ms integer,
          created_at text not null,
          foreign key (session_id) references local_sessions(id) on delete cascade,
          foreign key (message_id) references local_messages(id) on delete set null
        )`,
        'create index if not exists idx_local_messages_session_created on local_messages(session_id, created_at)',
        'create index if not exists idx_local_tool_calls_session_created on local_tool_calls(session_id, created_at)',
      ],
    },
    {
      name: '0002_local_state_fts',
      statements: [
        `create virtual table if not exists local_state_fts using fts5(
          kind,
          entity_id unindexed,
          session_id unindexed,
          title,
          body,
          created_at unindexed
        )`,
      ],
    },
    {
      name: '0003_benchmark_core',
      statements: [
        `create table if not exists benchmark_definitions (
          id text primary key,
          project_root text not null,
          name text not null,
          description text,
          target_type text not null,
          definition_json text not null,
          created_at text not null,
          updated_at text not null
        )`,
        `create table if not exists benchmark_cases (
          id text primary key,
          definition_id text not null,
          ordinal integer not null,
          input text not null,
          expected text,
          case_json text not null,
          foreign key (definition_id) references benchmark_definitions(id) on delete cascade
        )`,
        `create table if not exists benchmark_runs (
          id text primary key,
          definition_id text not null,
          project_root text not null,
          status text not null check (status in ('queued', 'running', 'scoring', 'completed', 'failed', 'cancelled')),
          started_at text not null,
          completed_at text,
          summary_json text,
          error text,
          artifact_dir text,
          definition_json text not null,
          foreign key (definition_id) references benchmark_definitions(id) on delete cascade
        )`,
        `create table if not exists benchmark_results (
          id text primary key,
          run_id text not null,
          case_id text not null,
          status text not null check (status in ('passed', 'failed', 'error', 'skipped')),
          input text not null,
          output_preview text,
          result_json text not null,
          score real not null default 0,
          cost real not null default 0,
          tokens integer not null default 0,
          latency_ms integer not null default 0,
          created_at text not null,
          foreign key (run_id) references benchmark_runs(id) on delete cascade
        )`,
        `create virtual table if not exists benchmark_results_fts using fts5(
          run_id unindexed,
          case_id unindexed,
          status unindexed,
          body,
          created_at unindexed
        )`,
        'create index if not exists idx_benchmark_definitions_project on benchmark_definitions(project_root, updated_at)',
        'create index if not exists idx_benchmark_runs_project on benchmark_runs(project_root, started_at)',
        'create index if not exists idx_benchmark_results_run on benchmark_results(run_id, created_at)',
      ],
    },
    {
      name: '0004_environment_activation',
      statements: [
        `create table if not exists environment_activations (
          project_root text primary key,
          environment_id text not null,
          manifest_source text not null check (manifest_source in ('builtin', 'project')),
          activated_at text not null,
          manifest_json text
        )`,
        'create index if not exists idx_environment_activations_environment on environment_activations(environment_id, activated_at)',
      ],
    },
    {
      name: '0005_scheduler_core',
      statements: [
        `create table if not exists local_schedules (
          id text primary key,
          project_root text not null,
          name text not null,
          description text,
          cron_expression text not null,
          timezone text,
          status text not null check (status in ('active', 'paused')),
          target_type text not null,
          target_ref text,
          target_json text not null,
          environment_id text,
          approval_policy text not null check (approval_policy in ('dry-run-only', 'approval-required', 'pre-approved')),
          budget_json text,
          max_runtime_ms integer not null,
          next_run_at text,
          last_run_at text,
          schedule_json text not null,
          created_at text not null,
          updated_at text not null
        )`,
        `create table if not exists local_schedule_runs (
          id text primary key,
          schedule_id text not null,
          project_root text not null,
          status text not null check (status in ('queued', 'running', 'completed', 'failed', 'blocked', 'timeout')),
          started_at text not null,
          completed_at text,
          due_at text,
          target_type text not null,
          summary_json text,
          error text,
          benchmark_run_id text,
          metadata_json text,
          run_json text not null,
          foreign key (schedule_id) references local_schedules(id) on delete cascade
        )`,
        'create index if not exists idx_local_schedules_project_next on local_schedules(project_root, status, next_run_at)',
        'create index if not exists idx_local_schedule_runs_schedule_started on local_schedule_runs(schedule_id, started_at)',
      ],
    },
    {
      name: '0006_local_memory',
      statements: [
        `create table if not exists local_memory_entries (
          id text primary key,
          project_hash text not null,
          project_root text not null,
          filename text not null,
          content text not null,
          content_hash text not null,
          source text not null default 'local_file',
          created_at text not null,
          updated_at text not null,
          unique(project_hash, filename)
        )`,
        `create virtual table if not exists local_memory_fts using fts5(
          project_hash unindexed,
          filename,
          content,
          updated_at unindexed
        )`,
        'create index if not exists idx_local_memory_project_updated on local_memory_entries(project_hash, updated_at)',
        'create index if not exists idx_local_memory_project_filename on local_memory_entries(project_hash, filename)',
      ],
    },
    {
      name: '0007_environment_profiles',
      run: (db) => {
        const columns = db.prepare('pragma table_info(environment_activations)').all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === 'profile_id')) {
          db.exec('alter table environment_activations add column profile_id text');
        }
      },
    },
  ];

  apply(db: Database.Database): void {
    db.exec('create table if not exists state_meta (name text primary key, applied_at text not null)');

    const hasMigration = db.prepare('select 1 from state_meta where name = ? limit 1');
    const markMigration = db.prepare('insert into state_meta (name, applied_at) values (?, ?)');

    for (const migration of this.migrations) {
      if (hasMigration.get(migration.name)) {
        continue;
      }

      const run = db.transaction(() => {
        for (const statement of migration.statements ?? []) {
          db.exec(statement);
        }
        migration.run?.(db);
        markMigration.run(migration.name, new Date().toISOString());
      });
      run();
    }
  }
}
