import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { StateDbService } from '../../state/services/state-db.service';
import {
  BenchmarkDefinition,
  BenchmarkResult,
  BenchmarkRun,
  BenchmarkRunStatus,
  BenchmarkSummary,
  CreateBenchmarkRunInput,
} from '../types';

@Injectable()
export class BenchmarkStoreService {
  constructor(private readonly dbService: StateDbService) {}

  async saveDefinition(definition: BenchmarkDefinition): Promise<BenchmarkDefinition> {
    const now = new Date().toISOString();
    const normalized: BenchmarkDefinition = {
      ...definition,
      id: definition.id || crypto.randomUUID(),
      cases: definition.cases ?? [],
      graders: definition.graders ?? [],
      createdAt: definition.createdAt || now,
      updatedAt: now,
    };

    await this.dbService.executeWrite((db) => {
      const upsertDefinition = db.prepare(`
        insert into benchmark_definitions (
          id, project_root, name, description, target_type, definition_json, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          project_root = excluded.project_root,
          name = excluded.name,
          description = excluded.description,
          target_type = excluded.target_type,
          definition_json = excluded.definition_json,
          updated_at = excluded.updated_at
      `);
      const deleteCases = db.prepare('delete from benchmark_cases where definition_id = ?');
      const insertCase = db.prepare(`
        insert into benchmark_cases (
          id, definition_id, ordinal, input, expected, case_json
        ) values (?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        upsertDefinition.run(
          normalized.id,
          normalized.projectRoot,
          normalized.name,
          normalized.description ?? null,
          normalized.target.type,
          JSON.stringify(normalized),
          normalized.createdAt,
          normalized.updatedAt,
        );
        deleteCases.run(normalized.id);
        normalized.cases.forEach((benchmarkCase, index) => {
          insertCase.run(
            benchmarkCase.id,
            normalized.id,
            index,
            benchmarkCase.input,
            benchmarkCase.expected ?? null,
            JSON.stringify(benchmarkCase),
          );
        });
      })();
    });

    return normalized;
  }

  async listDefinitions(projectRoot: string): Promise<BenchmarkDefinition[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select definition_json
      from benchmark_definitions
      where project_root = ?
      order by updated_at desc, name asc
    `).all(projectRoot) as Array<{ definition_json: string }>;

    return rows.map((row) => this.parseJson<BenchmarkDefinition>(row.definition_json));
  }

  async getDefinition(id: string): Promise<BenchmarkDefinition | null> {
    const db = await this.dbService.getDb();
    const row = db.prepare(`
      select definition_json
      from benchmark_definitions
      where id = ?
      limit 1
    `).get(id) as { definition_json: string } | undefined;

    return row ? this.parseJson<BenchmarkDefinition>(row.definition_json) : null;
  }

  async createRun(input: CreateBenchmarkRunInput): Promise<BenchmarkRun> {
    const run: BenchmarkRun = {
      id: crypto.randomUUID(),
      definitionId: input.definitionId,
      projectRoot: input.projectRoot,
      status: 'queued',
      startedAt: new Date().toISOString(),
      artifactDir: input.artifactDir,
      definitionSnapshot: input.definitionSnapshot,
    };

    await this.dbService.executeWrite((db) => {
      db.prepare(`
        insert into benchmark_runs (
          id, definition_id, project_root, status, started_at, artifact_dir, definition_json
        ) values (?, ?, ?, ?, ?, ?, ?)
      `).run(
        run.id,
        run.definitionId,
        run.projectRoot,
        run.status,
        run.startedAt,
        run.artifactDir ?? null,
        JSON.stringify(input.definitionSnapshot),
      );
    });

    return run;
  }

  async updateRunStatus(runId: string, status: BenchmarkRunStatus, error?: string): Promise<void> {
    await this.dbService.executeWrite((db) => {
      db.prepare(`
        update benchmark_runs
        set status = ?, error = coalesce(?, error)
        where id = ?
      `).run(status, error ?? null, runId);
    });
  }

  async setRunArtifactDir(runId: string, artifactDir: string): Promise<void> {
    await this.dbService.executeWrite((db) => {
      db.prepare('update benchmark_runs set artifact_dir = ? where id = ?').run(artifactDir, runId);
    });
  }

  async appendResult(runId: string, result: BenchmarkResult): Promise<void> {
    await this.dbService.executeWrite((db) => {
      const insertResult = db.prepare(`
        insert into benchmark_results (
          id, run_id, case_id, status, input, output_preview, result_json, score, cost, tokens, latency_ms, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFts = db.prepare(`
        insert into benchmark_results_fts (run_id, case_id, status, body, created_at)
        values (?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        insertResult.run(
          result.id,
          runId,
          result.caseId,
          result.status,
          result.input,
          this.preview(result.output ?? result.error ?? ''),
          JSON.stringify(result),
          result.score,
          result.cost,
          result.tokens,
          result.latencyMs,
          result.completedAt,
        );
        insertFts.run(
          runId,
          result.caseId,
          result.status,
          [result.input, result.output, result.expected, result.error, ...result.scores.map((score) => score.reason)]
            .filter(Boolean)
            .join('\n'),
          result.completedAt,
        );
      })();
    });
  }

  async completeRun(runId: string, summary: BenchmarkSummary): Promise<void> {
    await this.dbService.executeWrite((db) => {
      db.prepare(`
        update benchmark_runs
        set status = 'completed', completed_at = ?, summary_json = ?
        where id = ?
      `).run(new Date().toISOString(), JSON.stringify(summary), runId);
    });
  }

  async failRun(runId: string, summary: BenchmarkSummary, error: string): Promise<void> {
    await this.dbService.executeWrite((db) => {
      db.prepare(`
        update benchmark_runs
        set status = 'failed', completed_at = ?, summary_json = ?, error = ?
        where id = ?
      `).run(new Date().toISOString(), JSON.stringify(summary), error, runId);
    });
  }

  async getRun(runId: string): Promise<BenchmarkRun | null> {
    const db = await this.dbService.getDb();
    const row = db.prepare(`
      select *
      from benchmark_runs
      where id = ?
      limit 1
    `).get(runId) as any | undefined;

    return row ? this.mapRun(row) : null;
  }

  async listRuns(projectRoot: string): Promise<BenchmarkRun[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select *
      from benchmark_runs
      where project_root = ?
      order by started_at desc
    `).all(projectRoot) as any[];

    return rows.map((row) => this.mapRun(row));
  }

  async listResults(runId: string): Promise<BenchmarkResult[]> {
    const db = await this.dbService.getDb();
    const rows = db.prepare(`
      select result_json
      from benchmark_results
      where run_id = ?
      order by created_at asc
    `).all(runId) as Array<{ result_json: string }>;

    return rows.map((row) => this.parseJson<BenchmarkResult>(row.result_json));
  }

  private mapRun(row: any): BenchmarkRun {
    return {
      id: row.id,
      definitionId: row.definition_id,
      projectRoot: row.project_root,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      summary: row.summary_json ? this.parseJson<BenchmarkSummary>(row.summary_json) : undefined,
      error: row.error ?? undefined,
      artifactDir: row.artifact_dir ?? undefined,
      definitionSnapshot: row.definition_json ? this.parseJson<BenchmarkDefinition>(row.definition_json) : undefined,
    };
  }

  private parseJson<T>(value: string): T {
    return JSON.parse(value) as T;
  }

  private preview(value: string, maxLength = 500): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
  }
}
