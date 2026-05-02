import { Injectable } from '@nestjs/common';
import {
  PlatformConfig,
  PlatformEvent,
  PlatformMemoryRetrieval,
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
