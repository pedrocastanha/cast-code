import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PlatformEvent, PlatformProjectPayload } from '../types';

const CACHE_FILE = 'platform.cache.json';
const PENDING_EVENTS_FILE = 'platform.pending-events.json';

@Injectable()
export class PlatformCacheService {
  async readProjectCache(projectRoot: string): Promise<PlatformProjectPayload | null> {
    try {
      const raw = await fs.readFile(this.filePath(projectRoot, CACHE_FILE), 'utf8');
      return JSON.parse(raw) as PlatformProjectPayload;
    } catch {
      return null;
    }
  }

  async writeProjectCache(projectRoot: string, payload: PlatformProjectPayload): Promise<void> {
    await this.ensureCastDir(projectRoot);
    const withTimestamp = { ...payload, fetchedAt: payload.fetchedAt || new Date().toISOString() };
    await fs.writeFile(this.filePath(projectRoot, CACHE_FILE), JSON.stringify(withTimestamp, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  isProjectCacheUsable(payload: PlatformProjectPayload | null | undefined, maxAgeMs = 86_400_000): boolean {
    if (!payload?.fetchedAt) {
      return false;
    }
    if (
      !payload.project ||
      typeof payload.project.id !== 'string' ||
      typeof payload.project.name !== 'string' ||
      !payload.features ||
      typeof payload.features.remoteAgents !== 'boolean' ||
      typeof payload.features.benchAccess !== 'boolean' ||
      typeof payload.features.maxSkills !== 'number' ||
      !Array.isArray(payload.skills) ||
      !Array.isArray(payload.agents)
    ) {
      return false;
    }
    const fetchedAt = new Date(payload.fetchedAt).getTime();
    return Number.isFinite(fetchedAt) && Date.now() - fetchedAt <= maxAgeMs;
  }

  async readPendingEvents(projectRoot: string): Promise<PlatformEvent[]> {
    try {
      const raw = await fs.readFile(this.filePath(projectRoot, PENDING_EVENTS_FILE), 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as PlatformEvent[] : [];
    } catch {
      return [];
    }
  }

  async appendPendingEvents(projectRoot: string, events: PlatformEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.ensureCastDir(projectRoot);
    const existing = await this.readPendingEvents(projectRoot);
    await fs.writeFile(
      this.filePath(projectRoot, PENDING_EVENTS_FILE),
      JSON.stringify([...existing, ...events], null, 2),
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  async clearPendingEvents(projectRoot: string): Promise<void> {
    try {
      await fs.unlink(this.filePath(projectRoot, PENDING_EVENTS_FILE));
    } catch {}
  }

  private async ensureCastDir(projectRoot: string): Promise<void> {
    await fs.mkdir(path.join(projectRoot, '.cast'), { recursive: true });
  }

  private filePath(projectRoot: string, fileName: string): string {
    return path.join(projectRoot, '.cast', fileName);
  }
}
