import { Injectable } from '@nestjs/common';
import * as os from 'node:os';
import { PlatformCacheService } from './platform-cache.service';
import { PlatformClientService } from './platform-client.service';
import { PlatformConfig, PlatformEvent, PlatformEventType } from '../types';

type SessionSummary = {
  duration?: number;
  totalTokens?: number;
  totalCost?: number;
};

const ALLOWED_PAYLOAD_KEYS: Record<PlatformEventType, string[]> = {
  'session.started': ['castVersion', 'os', 'nodeVersion'],
  'agent.invoked': ['role', 'model'],
  'skill.used': ['name', 'source'],
  'command.run': ['command'],
  'tokens.consumed': ['input', 'cachedInput', 'output', 'model', 'cost'],
  'session.ended': ['duration', 'totalTokens', 'totalCost'],
  'runtime.run.started': ['runId', 'runtime', 'provider', 'model'],
  'runtime.run.completed': ['runId', 'durationMs', 'status'],
  'runtime.run.failed': ['runId', 'errorClass', 'message'],
  'runtime.tool.started': ['runId', 'tool', 'scope'],
  'runtime.tool.completed': ['runId', 'tool', 'scope', 'status', 'durationMs', 'summary'],
  'runtime.tool.failed': ['runId', 'tool', 'scope', 'errorClass', 'message'],
  'runtime.usage': ['runId', 'input', 'cachedInput', 'output', 'model', 'cost'],
  'swarm.plan.created': ['planId', 'taskCount', 'maxWorkers', 'integrationMode'],
  'swarm.plan.approved': ['planId', 'runId', 'integrationMode'],
  'swarm.run.started': ['runId', 'taskCount', 'maxWorkers', 'runtime'],
  'swarm.run.completed': ['runId', 'durationMs', 'status', 'filesChanged'],
  'swarm.run.failed': ['runId', 'errorClass', 'message'],
  'swarm.task.started': ['runId', 'taskId', 'workerId'],
  'swarm.task.completed': ['runId', 'taskId', 'status', 'filesChanged'],
  'swarm.task.failed': ['runId', 'taskId', 'errorClass', 'message'],
  'swarm.integration.completed': ['runId', 'mode', 'filesApplied', 'status'],
  'swarm.integration.blocked': ['runId', 'reason', 'filesBlocked'],
};

@Injectable()
export class SessionTrackerService {
  private buffer: PlatformEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;
  private config: PlatformConfig | null = null;
  private apiKey: string | null = null;
  private startedAt: Date | null = null;
  private closing = false;
  private closePromise: Promise<void> | null = null;

  constructor(
    private readonly client: PlatformClientService,
    private readonly cache: PlatformCacheService,
  ) {}

  async start(
    config: PlatformConfig,
    apiKey: string,
    projectId: string,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    if (!config.enabled || this.sessionId || this.closing) {
      return;
    }

    this.config = config;
    this.apiKey = apiKey;
    this.startedAt = new Date();

    let response: { sessionId?: string; id?: string };
    try {
      response = await this.client.openSession(config, apiKey, {
        projectId,
        startedAt: this.startedAt.toISOString(),
        castVersion: meta.castVersion,
        os: meta.os || `${os.platform()} ${os.release()}`,
        nodeVersion: meta.nodeVersion || process.version,
      });
    } catch {
      if (this.closing) {
        return;
      }
      await this.cache.appendPendingEvents(config.projectRoot, [
        {
          type: 'session.started',
          payload: this.sanitize('session.started', {
            castVersion: meta.castVersion,
            os: meta.os || os.platform(),
            nodeVersion: meta.nodeVersion || process.version,
          }),
          ts: new Date().toISOString(),
        },
      ]);
      return;
    }

    if (this.closing) {
      return;
    }

    this.sessionId = response.sessionId || response.id || null;
    if (!this.sessionId) {
      return;
    }

    const pending = await this.cache.readPendingEvents(config.projectRoot);
    if (pending.length > 0) {
      await this.cache.clearPendingEvents(config.projectRoot);
    }

    if (this.closing) {
      this.sessionId = null;
      return;
    }

    this.track('session.started', {
      castVersion: meta.castVersion,
      os: meta.os || os.platform(),
      nodeVersion: meta.nodeVersion || process.version,
    });
    this.flushInterval = setInterval(() => void this.flush(), 30_000);
  }

  track(type: PlatformEventType, payload: Record<string, unknown>): void {
    if (this.closing) {
      return;
    }
    const event = {
      type,
      payload: this.sanitize(type, payload),
      ts: new Date().toISOString(),
    };

    if (!this.sessionId) {
      if (this.config) {
        void this.cache.appendPendingEvents(this.config.projectRoot, [event]);
      }
      return;
    }

    this.buffer.push(event);
    if (this.buffer.length >= 50) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.config || !this.apiKey || !this.sessionId || this.buffer.length === 0) {
      return;
    }

    const events = this.buffer.splice(0);
    try {
      await this.client.postEvents(this.config, this.apiKey, this.sessionId, events);
    } catch {
      await this.cache.appendPendingEvents(this.config.projectRoot, events);
    }
  }

  async close(summary: SessionSummary = {}): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }
    this.closePromise = this.doClose(summary);
    return this.closePromise;
  }

  private async doClose(summary: SessionSummary): Promise<void> {
    this.closing = true;
    this.stopTimer();

    if (!this.config || !this.apiKey || !this.sessionId) {
      return;
    }

    const duration = summary.duration ?? (this.startedAt ? Math.round((Date.now() - this.startedAt.getTime()) / 1000) : 0);
    this.buffer.push({
      type: 'session.ended',
      payload: this.sanitize('session.ended', {
        duration,
        totalTokens: summary.totalTokens,
        totalCost: summary.totalCost,
      }),
      ts: new Date().toISOString(),
    });

    await this.flush();
    const closePayload: { endedAt: string; totalTokens?: number; totalCost?: number } = {
      endedAt: new Date().toISOString(),
    };
    if (summary.totalTokens !== undefined) closePayload.totalTokens = summary.totalTokens;
    if (summary.totalCost !== undefined) closePayload.totalCost = summary.totalCost;
    try {
      await this.client.closeSession(this.config, this.apiKey, this.sessionId, closePayload);
    } catch {}
  }

  stopTimer(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  private sanitize(type: PlatformEventType, payload: Record<string, unknown>): Record<string, unknown> {
    const allowed = ALLOWED_PAYLOAD_KEYS[type];
    const sanitized: Record<string, unknown> = {};
    for (const key of allowed) {
      const value = payload[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
