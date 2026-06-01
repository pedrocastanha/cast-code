import { Injectable } from '@nestjs/common';
import {
  PlatformConfig,
  PlatformEvent,
  PlatformBenchmarkArtifactPayload,
  PlatformBenchmarkDefinitionPayload,
  PlatformBenchmarkDefinitionResponse,
  PlatformBenchmarkResultPayload,
  PlatformBenchmarkRunPayload,
  PlatformSchedulePayload,
  PlatformScheduleRunPayload,
  PlatformMemoryRetrieval,
  PlatformMemoryOverview,
  PlatformMemoryUsageResponse,
  PlatformProjectPayload,
} from '../types';

export class PlatformClientError extends Error {
  constructor(
    message: string,
    readonly code: 'http' | 'network' | 'timeout',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PlatformClientError';
  }
}

@Injectable()
export class PlatformClientService {
  authMe(config: PlatformConfig, apiKey: string, timeoutMs = 2000): Promise<unknown> {
    return this.request(config, apiKey, '/v1/auth/me', { method: 'GET' }, timeoutMs);
  }

  getProject(config: PlatformConfig, apiKey: string, timeoutMs = 2000): Promise<PlatformProjectPayload> {
    return this.request(config, apiKey, `/v1/projects/${encodeURIComponent(config.projectId || '')}`, { method: 'GET' }, timeoutMs);
  }

  listProjects(config: PlatformConfig, apiKey: string, timeoutMs = 2000): Promise<unknown> {
    return this.request(config, apiKey, '/v1/projects', { method: 'GET' }, timeoutMs);
  }

  openSession(
    config: PlatformConfig,
    apiKey: string,
    body: Record<string, unknown>,
    timeoutMs = 2000,
  ): Promise<{ sessionId?: string; id?: string }> {
    return this.request(config, apiKey, '/v1/sessions', this.jsonInit('POST', body), timeoutMs);
  }

  postEvents(
    config: PlatformConfig,
    apiKey: string,
    sessionId: string,
    events: PlatformEvent[],
    timeoutMs = 5000,
  ): Promise<unknown> {
    return this.request(
      config,
      apiKey,
      `/v1/sessions/${encodeURIComponent(sessionId)}/events`,
      this.jsonInit('POST', { events }),
      timeoutMs,
    );
  }

  closeSession(
    config: PlatformConfig,
    apiKey: string,
    sessionId: string,
    body: Record<string, unknown>,
    timeoutMs = 5000,
  ): Promise<unknown> {
    return this.request(
      config,
      apiKey,
      `/v1/sessions/${encodeURIComponent(sessionId)}`,
      this.jsonInit('PATCH', body),
      timeoutMs,
    );
  }

  retrieveMemory(
    config: PlatformConfig,
    apiKey: string,
    body: { query: string; topK?: number },
    timeoutMs = 5000,
  ): Promise<PlatformMemoryRetrieval> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/memory/retrieve`,
      this.jsonInit('POST', body),
      timeoutMs,
    );
  }

  memoryOverview(
    config: PlatformConfig,
    apiKey: string,
    timeoutMs = 5000,
  ): Promise<PlatformMemoryOverview> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/memory/overview`,
      { method: 'GET' },
      timeoutMs,
    );
  }

  markMemoryUsed(
    config: PlatformConfig,
    apiKey: string,
    body: { retrievalId: string; unitIds: string[] },
    timeoutMs = 3000,
  ): Promise<PlatformMemoryUsageResponse> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/memory/usage`,
      this.jsonInit('POST', body),
      timeoutMs,
    );
  }

  createBenchmarkDefinition(
    config: PlatformConfig,
    apiKey: string,
    body: PlatformBenchmarkDefinitionPayload,
    timeoutMs = 5000,
  ): Promise<PlatformBenchmarkDefinitionResponse> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/benchmarks`,
      this.jsonInit('POST', body),
      timeoutMs,
    );
  }

  updateBenchmarkDefinition(
    config: PlatformConfig,
    apiKey: string,
    benchmarkId: string,
    body: PlatformBenchmarkDefinitionPayload,
    timeoutMs = 5000,
  ): Promise<PlatformBenchmarkDefinitionResponse> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/benchmarks/${encodeURIComponent(benchmarkId)}`,
      this.jsonInit('PUT', body),
      timeoutMs,
    );
  }

  createBenchmarkRun(
    config: PlatformConfig,
    apiKey: string,
    benchmarkId: string,
    body: PlatformBenchmarkRunPayload,
    timeoutMs = 5000,
  ): Promise<PlatformBenchmarkRunPayload> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/benchmarks/${encodeURIComponent(benchmarkId)}/runs`,
      this.jsonInit('POST', body),
      timeoutMs,
    );
  }

  appendBenchmarkResult(
    config: PlatformConfig,
    apiKey: string,
    runId: string,
    body: PlatformBenchmarkResultPayload,
    timeoutMs = 5000,
  ): Promise<PlatformBenchmarkResultPayload> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/benchmark-runs/${encodeURIComponent(runId)}/results`,
      this.jsonInit('POST', body),
      timeoutMs,
    );
  }

  appendBenchmarkArtifact(
    config: PlatformConfig,
    apiKey: string,
    runId: string,
    body: PlatformBenchmarkArtifactPayload,
    timeoutMs = 5000,
  ): Promise<PlatformBenchmarkArtifactPayload> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/benchmark-runs/${encodeURIComponent(runId)}/artifacts`,
      this.jsonInit('POST', body),
      timeoutMs,
    );
  }

  createSchedule(
    config: PlatformConfig,
    apiKey: string,
    body: PlatformSchedulePayload,
    timeoutMs = 5000,
  ): Promise<PlatformSchedulePayload> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/schedules`,
      this.jsonInit('POST', body),
      timeoutMs,
    );
  }

  updateSchedule(
    config: PlatformConfig,
    apiKey: string,
    scheduleId: string,
    body: PlatformSchedulePayload,
    timeoutMs = 5000,
  ): Promise<PlatformSchedulePayload> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/schedules/${encodeURIComponent(scheduleId)}`,
      this.jsonInit('PATCH', body),
      timeoutMs,
    );
  }

  createScheduleRun(
    config: PlatformConfig,
    apiKey: string,
    scheduleId: string,
    body: PlatformScheduleRunPayload,
    timeoutMs = 5000,
  ): Promise<PlatformScheduleRunPayload> {
    return this.request(
      config,
      apiKey,
      `/v1/projects/${encodeURIComponent(config.projectId || '')}/schedules/${encodeURIComponent(scheduleId)}/runs`,
      this.jsonInit('POST', body),
      timeoutMs,
    );
  }

  private async request<T>(
    config: PlatformConfig,
    apiKey: string,
    endpoint: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.url(config, endpoint), {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PlatformClientError(`Platform API request failed with status ${response.status}`, 'http', response.status);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof PlatformClientError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new PlatformClientError('Platform API request timed out', 'timeout');
      }
      throw new PlatformClientError(`Platform API request failed: ${(error as Error).name || 'network error'}`, 'network');
    } finally {
      clearTimeout(timeout);
    }
  }

  private jsonInit(method: string, body: unknown): RequestInit {
    return {
      method,
      body: JSON.stringify(body),
    };
  }

  private url(config: PlatformConfig, endpoint: string): string {
    return `${config.apiUrl.replace(/\/+$/, '')}${endpoint}`;
  }
}
