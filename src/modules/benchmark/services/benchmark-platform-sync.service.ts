import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PlatformClientError, PlatformClientService } from '../../platform/services/platform-client.service';
import { PlatformConfigService } from '../../platform/services/platform-config.service';
import type {
  PlatformBenchmarkArtifactPayload,
  PlatformBenchmarkDefinitionPayload,
  PlatformBenchmarkDefinitionResponse,
  PlatformBenchmarkResultPayload,
  PlatformBenchmarkRunPayload,
} from '../../platform/types';
import type { BenchmarkDefinition, BenchmarkResult, BenchmarkRun } from '../types';
import { BenchmarkStoreService } from './benchmark-store.service';

const PENDING_BENCHMARK_SYNC_FILE = 'platform.pending-benchmark-sync.json';
const BENCHMARK_SYNC_MAP_FILE = 'platform.benchmark-map.json';

export interface BenchmarkPlatformSyncResult {
  status: 'synced' | 'skipped' | 'queued';
  message?: string;
  webUrl?: string;
}

interface PendingBenchmarkSyncItem {
  queuedAt: string;
  reason: string;
  definition: PlatformBenchmarkDefinitionPayload;
  run?: PlatformBenchmarkRunPayload;
}

interface RemoteDefinitionMap {
  remoteDefinitionId: string;
  cases: Record<string, string>;
  updatedAt: string;
}

interface BenchmarkPlatformMap {
  definitions: Record<string, RemoteDefinitionMap>;
  runs: Record<string, { remoteRunId: string; remoteDefinitionId: string; updatedAt: string }>;
}

@Injectable()
export class BenchmarkPlatformSyncService {
  constructor(
    private readonly configService: PlatformConfigService,
    private readonly client: PlatformClientService,
    private readonly store: BenchmarkStoreService,
  ) {}

  async syncDefinition(definition: BenchmarkDefinition): Promise<BenchmarkPlatformSyncResult> {
    const context = await this.getContext(definition.projectRoot);
    if (!context) {
      return { status: 'skipped', message: 'Platform is not linked.' };
    }

    const payload = this.definitionPayload(definition);
    try {
      await this.ensureRemoteDefinition(context, definition, payload);
      return { status: 'synced' };
    } catch (error) {
      await this.queue(definition.projectRoot, {
        queuedAt: new Date().toISOString(),
        reason: this.errorMessage(error),
        definition: payload,
      });
      return { status: 'queued', message: this.errorMessage(error) };
    }
  }

  async syncCompletedRun(definition: BenchmarkDefinition, run: BenchmarkRun): Promise<BenchmarkPlatformSyncResult> {
    const context = await this.getContext(definition.projectRoot);
    if (!context) {
      return { status: 'skipped', message: 'Platform is not linked.' };
    }

    const definitionPayload = this.definitionPayload(definition);
    try {
      const remoteDefinition = await this.ensureRemoteDefinition(context, definition, definitionPayload);
      const runPayload = this.runPayload(remoteDefinition.remoteDefinitionId, definition, run);
      const remoteRun = await this.client.createBenchmarkRun(
        context.config,
        context.apiKey,
        remoteDefinition.remoteDefinitionId,
        runPayload,
      );
      const remoteRunId = remoteRun.id || run.id;

      const results = await this.store.listResults(run.id);
      for (const result of results) {
        const remoteCaseId = remoteDefinition.cases[result.caseId];
        if (!remoteCaseId) {
          throw new Error(`Missing remote case mapping for ${result.caseId}`);
        }
        await this.client.appendBenchmarkResult(context.config, context.apiKey, remoteRunId, this.resultPayload(result, remoteCaseId));
      }

      for (const artifact of this.artifactPayloads(run)) {
        await this.client.appendBenchmarkArtifact(context.config, context.apiKey, remoteRunId, artifact);
      }

      await this.writeRunMapping(definition.projectRoot, run.id, remoteRunId, remoteDefinition.remoteDefinitionId);

      return {
        status: 'synced',
        webUrl: this.getWebRunUrlFromConfig(context.config.apiUrl, context.config.projectId!, remoteRunId),
      };
    } catch (error) {
      await this.queue(definition.projectRoot, {
        queuedAt: new Date().toISOString(),
        reason: this.errorMessage(error),
        definition: definitionPayload,
        run: this.runPayload(definition.id, definition, run),
      });
      return { status: 'queued', message: this.errorMessage(error) };
    }
  }

  async getWebRunUrl(projectRoot: string, runId: string): Promise<string | null> {
    const config = await this.configService.readConfig(projectRoot);
    if (!config.enabled || !config.projectId) {
      return null;
    }
    const mapping = await this.readMap(projectRoot);
    const remoteRunId = mapping.runs[runId]?.remoteRunId;
    if (!remoteRunId) {
      return null;
    }
    return this.getWebRunUrlFromConfig(config.apiUrl, config.projectId, remoteRunId);
  }

  async readPending(projectRoot: string): Promise<PendingBenchmarkSyncItem[]> {
    try {
      const raw = await fs.readFile(this.pendingPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as PendingBenchmarkSyncItem[] : [];
    } catch {
      return [];
    }
  }

  private async getContext(projectRoot: string): Promise<{ config: Awaited<ReturnType<PlatformConfigService['readConfig']>>; apiKey: string } | null> {
    const config = await this.configService.readConfig(projectRoot);
    if (!config.enabled || !config.projectId) {
      return null;
    }
    const apiKey = this.configService.getApiKey(config);
    if (!apiKey) {
      return null;
    }
    return { config, apiKey };
  }

  private async ensureRemoteDefinition(
    context: NonNullable<Awaited<ReturnType<BenchmarkPlatformSyncService['getContext']>>>,
    definition: BenchmarkDefinition,
    payload: PlatformBenchmarkDefinitionPayload,
  ): Promise<RemoteDefinitionMap> {
    const mapping = await this.readMap(definition.projectRoot);
    const existing = mapping.definitions[definition.id];
    const response = existing
      ? await this.client.updateBenchmarkDefinition(context.config, context.apiKey, existing.remoteDefinitionId, payload)
      : await this.client.createBenchmarkDefinition(context.config, context.apiKey, payload);
    const next = this.definitionMapFromResponse(definition, response);
    await this.writeDefinitionMapping(definition.projectRoot, definition.id, next);
    return next;
  }

  private definitionPayload(definition: BenchmarkDefinition): PlatformBenchmarkDefinitionPayload {
    return {
      name: definition.name,
      targetType: definition.target.type,
      targetRef: this.targetRef(definition),
      environmentId: definition.environmentId,
      config: {
        description: definition.description,
        target: definition.target,
        graders: definition.graders,
        budget: definition.budget,
        models: definition.models,
        tags: definition.tags,
      },
      cases: definition.cases.map((benchmarkCase) => ({
        input: { value: benchmarkCase.input, localCaseId: benchmarkCase.id },
        expected: benchmarkCase.expected === undefined ? undefined : { value: benchmarkCase.expected },
        rubric: {
          ...(benchmarkCase.metadata ?? {}),
          localCaseId: benchmarkCase.id,
        },
        tags: Array.isArray(benchmarkCase.metadata?.tags) ? benchmarkCase.metadata.tags as string[] : undefined,
      })),
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt,
    };
  }

  private runPayload(remoteDefinitionId: string, definition: BenchmarkDefinition, run: BenchmarkRun): PlatformBenchmarkRunPayload {
    return {
      benchmarkId: remoteDefinitionId,
      status: run.status,
      runConfig: {
        artifactDir: this.relativeArtifactDir(run),
        localDefinitionId: run.definitionId,
        localRunId: run.id,
        localBenchmarkId: definition.id,
      },
      summary: run.summary as Record<string, unknown> | undefined,
      startedAt: run.startedAt,
      endedAt: run.completedAt,
      createdAt: run.startedAt,
    };
  }

  private resultPayload(result: BenchmarkResult, remoteCaseId: string): PlatformBenchmarkResultPayload {
    return {
      caseId: remoteCaseId,
      status: result.status,
      scores: { items: result.scores, localResultId: result.id, localCaseId: result.caseId },
      outputPreview: this.preview(result.output ?? result.error ?? ''),
      latencyMs: result.latencyMs,
      cost: result.cost,
      error: result.error ? this.preview(result.error) : undefined,
      createdAt: result.completedAt,
    };
  }

  private artifactPayloads(run: BenchmarkRun): PlatformBenchmarkArtifactPayload[] {
    if (!run.artifactDir) {
      return [];
    }
    return [
      this.artifactPayload(run, 'config', 'config.json'),
      this.artifactPayload(run, 'cases', 'cases.jsonl'),
      this.artifactPayload(run, 'results', 'results.jsonl'),
      this.artifactPayload(run, 'report', 'report.md'),
    ];
  }

  private artifactPayload(run: BenchmarkRun, kind: string, name: string): PlatformBenchmarkArtifactPayload {
    return {
      kind,
      name,
      path: this.relativeArtifactPath(run, name),
      metadata: {
        localRunId: run.id,
        generatedBy: 'cast-code',
      },
      createdAt: run.completedAt ?? run.startedAt,
    };
  }

  private targetRef(definition: BenchmarkDefinition): string {
    if (typeof definition.target.config.url === 'string') {
      return definition.target.config.url;
    }
    if (typeof definition.target.config.prompt === 'string') {
      return 'model_prompt';
    }
    return definition.target.type;
  }

  private definitionMapFromResponse(definition: BenchmarkDefinition, response: PlatformBenchmarkDefinitionResponse): RemoteDefinitionMap {
    const knownLocalCaseIds = new Set(definition.cases.map((benchmarkCase) => benchmarkCase.id));
    const cases: Record<string, string> = {};
    response.cases.forEach((remoteCase, index) => {
      const mappedCaseId = this.remoteLocalCaseId(remoteCase);
      const localCaseId = mappedCaseId ?? definition.cases[index]?.id;
      if (localCaseId && knownLocalCaseIds.has(localCaseId)) {
        cases[localCaseId] = remoteCase.id;
      }
    });
    return {
      remoteDefinitionId: response.definition.id,
      cases,
      updatedAt: new Date().toISOString(),
    };
  }

  private remoteLocalCaseId(remoteCase: PlatformBenchmarkDefinitionResponse['cases'][number]): string | undefined {
    const localCaseId = remoteCase.rubric?.localCaseId;
    return typeof localCaseId === 'string' && localCaseId.length > 0 ? localCaseId : undefined;
  }

  private relativeArtifactPath(run: BenchmarkRun, name: string): string {
    const artifactDir = run.artifactDir!;
    const absoluteArtifactPath = path.isAbsolute(artifactDir)
      ? path.join(artifactDir, name)
      : path.resolve(run.projectRoot, artifactDir, name);
    const relative = path.relative(run.projectRoot, absoluteArtifactPath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return this.posixPath(relative);
    }
    return this.posixPath(path.join('.cast', 'benchmarks', run.id, name));
  }

  private relativeArtifactDir(run: BenchmarkRun): string | undefined {
    if (!run.artifactDir) {
      return undefined;
    }
    const absoluteArtifactDir = path.isAbsolute(run.artifactDir)
      ? run.artifactDir
      : path.resolve(run.projectRoot, run.artifactDir);
    const relative = path.relative(run.projectRoot, absoluteArtifactDir);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return this.posixPath(relative);
    }
    return this.posixPath(path.join('.cast', 'benchmarks', run.id));
  }

  private posixPath(value: string): string {
    return value.split(path.sep).join('/');
  }

  private async queue(projectRoot: string, item: PendingBenchmarkSyncItem): Promise<void> {
    await fs.mkdir(path.join(projectRoot, '.cast'), { recursive: true });
    const pending = await this.readPending(projectRoot);
    await fs.writeFile(
      this.pendingPath(projectRoot),
      JSON.stringify([...pending, item], null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
  }

  private pendingPath(projectRoot: string): string {
    return path.join(projectRoot, '.cast', PENDING_BENCHMARK_SYNC_FILE);
  }

  private mapPath(projectRoot: string): string {
    return path.join(projectRoot, '.cast', BENCHMARK_SYNC_MAP_FILE);
  }

  private async readMap(projectRoot: string): Promise<BenchmarkPlatformMap> {
    try {
      const raw = await fs.readFile(this.mapPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        definitions: parsed.definitions ?? {},
        runs: parsed.runs ?? {},
      };
    } catch {
      return { definitions: {}, runs: {} };
    }
  }

  private async writeDefinitionMapping(projectRoot: string, localDefinitionId: string, definitionMap: RemoteDefinitionMap): Promise<void> {
    const mapping = await this.readMap(projectRoot);
    mapping.definitions[localDefinitionId] = definitionMap;
    await this.writeMap(projectRoot, mapping);
  }

  private async writeRunMapping(projectRoot: string, localRunId: string, remoteRunId: string, remoteDefinitionId: string): Promise<void> {
    const mapping = await this.readMap(projectRoot);
    mapping.runs[localRunId] = {
      remoteRunId,
      remoteDefinitionId,
      updatedAt: new Date().toISOString(),
    };
    await this.writeMap(projectRoot, mapping);
  }

  private async writeMap(projectRoot: string, mapping: BenchmarkPlatformMap): Promise<void> {
    await fs.mkdir(path.join(projectRoot, '.cast'), { recursive: true });
    await fs.writeFile(
      this.mapPath(projectRoot),
      JSON.stringify(mapping, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
  }

  private getWebRunUrlFromConfig(apiUrl: string, projectId: string, runId: string): string {
    const webBaseUrl = process.env.CAST_PLATFORM_WEB_URL || this.deriveWebBaseUrl(apiUrl);
    return `${webBaseUrl.replace(/\/+$/g, '')}/projects/${encodeURIComponent(projectId)}/benchmarks/${encodeURIComponent(runId)}`;
  }

  private deriveWebBaseUrl(apiUrl: string): string {
    try {
      const parsed = new URL(apiUrl);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return 'http://localhost:3003';
      }
      parsed.hostname = parsed.hostname.replace(/^api\./, '');
      return parsed.origin;
    } catch {
      return 'http://localhost:3003';
    }
  }

  private preview(value: string, maxLength = 500): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof PlatformClientError) {
      return error.message;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
