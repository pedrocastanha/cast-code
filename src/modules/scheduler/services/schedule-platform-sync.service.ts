import { Injectable, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PlatformClientError, PlatformClientService } from '../../platform/services/platform-client.service';
import { PlatformConfigService } from '../../platform/services/platform-config.service';
import { StateRedactionService } from '../../state/services/state-redaction.service';
import type {
  PlatformSchedulePayload,
  PlatformScheduleRunPayload,
} from '../../platform/types';
import type { ScheduleDefinition, ScheduleRun } from '../types';

const PENDING_SCHEDULE_SYNC_FILE = 'platform.pending-schedule-sync.json';
const SCHEDULE_SYNC_MAP_FILE = 'platform.schedule-map.json';

export interface SchedulePlatformSyncResult {
  status: 'synced' | 'skipped' | 'queued';
  message?: string;
  webUrl?: string;
}

interface PendingScheduleSyncItem {
  queuedAt: string;
  reason: string;
  schedule: PlatformSchedulePayload;
  run?: PlatformScheduleRunPayload;
}

interface SchedulePlatformMap {
  schedules: Record<string, { remoteScheduleId: string; updatedAt: string }>;
  runs: Record<string, { remoteRunId: string; remoteScheduleId: string; updatedAt: string }>;
}

@Injectable()
export class SchedulePlatformSyncService {
  constructor(
    private readonly configService: PlatformConfigService,
    private readonly client: PlatformClientService,
    @Optional()
    private readonly redaction: StateRedactionService = new StateRedactionService(),
  ) {}

  async syncDefinition(schedule: ScheduleDefinition): Promise<SchedulePlatformSyncResult> {
    const context = await this.getContext(schedule.projectRoot);
    if (!context) {
      return { status: 'skipped', message: 'Platform is not linked.' };
    }

    const payload = this.schedulePayload(schedule);
    try {
      await this.ensureRemoteSchedule(context, schedule, payload);
      return { status: 'synced' };
    } catch (error) {
      await this.queue(schedule.projectRoot, {
        queuedAt: new Date().toISOString(),
        reason: this.errorMessage(error),
        schedule: payload,
      });
      return { status: 'queued', message: this.errorMessage(error) };
    }
  }

  async syncRun(schedule: ScheduleDefinition, run: ScheduleRun): Promise<SchedulePlatformSyncResult> {
    const context = await this.getContext(schedule.projectRoot);
    if (!context) {
      return { status: 'skipped', message: 'Platform is not linked.' };
    }

    const payload = this.schedulePayload(schedule);
    try {
      const remoteScheduleId = await this.ensureRemoteSchedule(context, schedule, payload);
      const remoteRun = await this.client.createScheduleRun(
        context.config,
        context.apiKey,
        remoteScheduleId,
        this.runPayload(remoteScheduleId, run),
      );
      await this.writeRunMapping(schedule.projectRoot, run.id, remoteRun.id || run.id, remoteScheduleId);
      return {
        status: 'synced',
        webUrl: this.getWebRunUrlFromConfig(context.config.apiUrl, context.config.projectId!, remoteScheduleId),
      };
    } catch (error) {
      await this.queue(schedule.projectRoot, {
        queuedAt: new Date().toISOString(),
        reason: this.errorMessage(error),
        schedule: payload,
        run: this.runPayload(schedule.id, run),
      });
      return { status: 'queued', message: this.errorMessage(error) };
    }
  }

  private async ensureRemoteSchedule(
    context: NonNullable<Awaited<ReturnType<SchedulePlatformSyncService['getContext']>>>,
    schedule: ScheduleDefinition,
    payload: PlatformSchedulePayload,
  ): Promise<string> {
    const mapping = await this.readMap(schedule.projectRoot);
    const existing = mapping.schedules[schedule.id]?.remoteScheduleId;
    const response = existing
      ? await this.client.updateSchedule(context.config, context.apiKey, existing, payload)
      : await this.client.createSchedule(context.config, context.apiKey, payload);
    const remoteScheduleId = response.id || existing || schedule.id;
    await this.writeScheduleMapping(schedule.projectRoot, schedule.id, remoteScheduleId);
    return remoteScheduleId;
  }

  private schedulePayload(schedule: ScheduleDefinition): PlatformSchedulePayload {
    return {
      name: schedule.name,
      cronExpression: schedule.cronExpression,
      target: {
        type: this.platformTargetType(schedule.target.type),
        ref: this.targetRef(schedule),
        config: this.targetConfigSummary(schedule),
      },
      environmentId: schedule.environmentId ?? undefined,
      approvalPolicy: this.approvalPolicy(schedule.approvalPolicy, schedule.target.type),
      budget: this.budget(schedule),
      status: schedule.status,
      nextRunAt: schedule.nextRunAt,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }

  private runPayload(_remoteScheduleId: string, run: ScheduleRun): PlatformScheduleRunPayload {
    return {
      status: this.runStatus(run.status),
      runConfig: {
        localRunId: run.id,
        localScheduleId: run.scheduleId,
        benchmarkRunId: run.benchmarkRunId,
        targetType: run.targetType,
        dueAt: run.dueAt,
        metadata: run.metadata,
        errorHash: run.error ? this.contentHash(run.error) : undefined,
        errorStoredLocally: Boolean(run.error),
      },
      summary: run.summary,
      logs: [],
      error: run.error ? this.contentReference(run.error) : null,
      startedAt: run.startedAt,
      endedAt: run.completedAt,
    };
  }

  private budget(schedule: ScheduleDefinition): PlatformSchedulePayload['budget'] {
    const budget = schedule.budget;
    if (!budget) {
      return undefined;
    }
    return {
      maxUsd: budget.maxCostUsd,
      maxTokens: budget.maxTokens,
      maxRuns: budget.maxCases,
      maxRuntimeSeconds: Math.ceil((budget.maxRuntimeMs ?? schedule.maxRuntimeMs) / 1000),
    };
  }

  private approvalPolicy(schedulePolicy: ScheduleDefinition['approvalPolicy'], targetType: ScheduleDefinition['target']['type']): NonNullable<PlatformSchedulePayload['approvalPolicy']> {
    if (schedulePolicy === 'pre-approved') {
      return {
        mode: 'explicit',
        allowShell: targetType === 'shell_command',
        allowExternalMutation: true,
      };
    }
    if (schedulePolicy === 'approval-required') {
      return {
        mode: 'balanced',
        allowShell: false,
        allowExternalMutation: false,
        requireManualApproval: true,
      };
    }
    return {
      mode: 'read-only',
      allowShell: false,
      allowExternalMutation: false,
    };
  }

  private platformTargetType(targetType: ScheduleDefinition['target']['type']): string {
    return targetType === 'report' ? 'agent_prompt' : targetType;
  }

  private targetRef(schedule: ScheduleDefinition): string {
    if (schedule.target.type === 'benchmark' && typeof schedule.target.ref === 'string') {
      return this.redaction.contentPreview(schedule.target.ref, 180);
    }
    if (schedule.target.type === 'rag_refresh') {
      return typeof schedule.target.config.source === 'string'
        ? this.redaction.contentPreview(schedule.target.config.source, 180)
        : 'project-memory';
    }
    return schedule.target.type;
  }

  private targetConfigSummary(schedule: ScheduleDefinition): Record<string, unknown> {
    const config = schedule.target.config ?? {};
    const summary: Record<string, unknown> = {
      localScheduleId: schedule.id,
      description: schedule.description,
      tags: schedule.tags,
      timezone: schedule.timezone,
      maxRuntimeMs: schedule.maxRuntimeMs,
      configKeys: Object.keys(config).sort(),
      privacy: {
        rawTargetConfig: false,
      },
    };

    const content = this.contentSummary(config, ['prompt', 'input', 'expected', 'task', 'command', 'body', 'headers', 'systemPrompt']);
    if (Object.keys(content).length > 0) {
      summary.content = content;
    }
    if (typeof config.definitionId === 'string') {
      summary.definitionId = config.definitionId;
    }
    if (typeof config.environmentId === 'string') {
      summary.environmentId = config.environmentId;
    }
    if (typeof config.method === 'string') {
      summary.method = config.method.toUpperCase();
    }
    if (typeof config.url === 'string') {
      summary.url = this.safeUrl(config.url);
    }
    if (typeof config.endpoint === 'string') {
      summary.endpoint = this.safeUrl(config.endpoint);
    }
    if (typeof config.source === 'string') {
      summary.source = this.redaction.contentPreview(config.source, 180);
    }
    for (const key of ['dryRun', 'write', 'writeEnabled', 'mutate', 'mutation']) {
      if (typeof config[key] === 'boolean') {
        summary[key] = config[key];
      }
    }
    return summary;
  }

  private contentSummary(config: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    const content: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in config) {
        content[key] = this.contentReference(config[key]);
      }
    }
    return content;
  }

  private contentReference(value: unknown): Record<string, unknown> {
    return {
      storedLocally: true,
      contentHash: this.contentHash(value),
      byteLength: Buffer.byteLength(this.contentString(value), 'utf-8'),
    };
  }

  private contentHash(value: unknown): string {
    return crypto.createHash('sha256').update(this.contentString(value)).digest('hex');
  }

  private contentString(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  }

  private safeUrl(value: string): string {
    try {
      const parsed = new URL(value);
      parsed.username = '';
      parsed.password = '';
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (/(token|key|secret|password|auth|credential)/i.test(key)) {
          parsed.searchParams.set(key, '[REDACTED]');
        }
      }
      return parsed.toString();
    } catch {
      return this.redaction.contentPreview(value, 240);
    }
  }

  private runStatus(status: ScheduleRun['status']): PlatformScheduleRunPayload['status'] {
    switch (status) {
    case 'queued':
    case 'running':
      return status;
    case 'completed':
      return 'successful';
    case 'blocked':
    case 'timeout':
    case 'failed':
      return 'failed';
    default:
      return 'failed';
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

  private async queue(projectRoot: string, item: PendingScheduleSyncItem): Promise<void> {
    await fs.mkdir(path.join(projectRoot, '.cast'), { recursive: true });
    const pending = await this.readPending(projectRoot);
    await fs.writeFile(
      this.pendingPath(projectRoot),
      JSON.stringify([...pending, item], null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
  }

  private async readPending(projectRoot: string): Promise<PendingScheduleSyncItem[]> {
    try {
      const raw = await fs.readFile(this.pendingPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as PendingScheduleSyncItem[] : [];
    } catch {
      return [];
    }
  }

  private pendingPath(projectRoot: string): string {
    return path.join(projectRoot, '.cast', PENDING_SCHEDULE_SYNC_FILE);
  }

  private mapPath(projectRoot: string): string {
    return path.join(projectRoot, '.cast', SCHEDULE_SYNC_MAP_FILE);
  }

  private async readMap(projectRoot: string): Promise<SchedulePlatformMap> {
    try {
      const raw = await fs.readFile(this.mapPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        schedules: parsed.schedules ?? {},
        runs: parsed.runs ?? {},
      };
    } catch {
      return { schedules: {}, runs: {} };
    }
  }

  private async writeScheduleMapping(projectRoot: string, localScheduleId: string, remoteScheduleId: string): Promise<void> {
    const mapping = await this.readMap(projectRoot);
    mapping.schedules[localScheduleId] = {
      remoteScheduleId,
      updatedAt: new Date().toISOString(),
    };
    await this.writeMap(projectRoot, mapping);
  }

  private async writeRunMapping(projectRoot: string, localRunId: string, remoteRunId: string, remoteScheduleId: string): Promise<void> {
    const mapping = await this.readMap(projectRoot);
    mapping.runs[localRunId] = {
      remoteRunId,
      remoteScheduleId,
      updatedAt: new Date().toISOString(),
    };
    await this.writeMap(projectRoot, mapping);
  }

  private async writeMap(projectRoot: string, mapping: SchedulePlatformMap): Promise<void> {
    await fs.mkdir(path.join(projectRoot, '.cast'), { recursive: true });
    await fs.writeFile(
      this.mapPath(projectRoot),
      JSON.stringify(mapping, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
  }

  private getWebRunUrlFromConfig(apiUrl: string, projectId: string, scheduleId: string): string {
    const webBaseUrl = this.getConfiguredWebBaseUrl() || this.deriveWebBaseUrl(apiUrl);
    return `${webBaseUrl.replace(/\/+$/g, '')}/projects/${encodeURIComponent(projectId)}/schedules/${encodeURIComponent(scheduleId)}`;
  }

  private getConfiguredWebBaseUrl(): string | undefined {
    return process.env.CAST_BENCHMARK_LAB_WEB_URL || process.env.CAST_PLATFORM_WEB_URL;
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

  private errorMessage(error: unknown): string {
    if (error instanceof PlatformClientError) {
      return error.message;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
