import { Inject, Injectable, forwardRef } from '@nestjs/common';
import * as os from 'node:os';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { PlatformCacheService } from './platform-cache.service';
import { PlatformClientService } from './platform-client.service';
import { PlatformConfigService } from './platform-config.service';
import { RemoteDefinitionAdapterService } from './remote-definition-adapter.service';
import { SessionTrackerService } from './session-tracker.service';
import {
  PlatformBootstrapResult,
  PlatformConfig,
  PlatformEventType,
  PlatformFeatures,
  PlatformMemoryOverview,
  PlatformMemoryRetrieval,
  PlatformMemoryUsageResponse,
  PlatformProjectPayload,
  PlatformStatus,
} from '../types';

const { version: castVersion } = require('../../../../package.json') as { version: string };

@Injectable()
export class PlatformService {
  private status: PlatformStatus = 'disabled';
  private config: PlatformConfig | null = null;
  private apiKey: string | null = null;
  private project: PlatformProjectPayload['project'] | null = null;
  private features: PlatformFeatures | null = null;
  private settings: PlatformProjectPayload['settings'] | null = null;

  constructor(
    private readonly configService: PlatformConfigService,
    private readonly client: PlatformClientService,
    private readonly cache: PlatformCacheService,
    private readonly adapter: RemoteDefinitionAdapterService,
    @Inject(forwardRef(() => SkillRegistryService))
    private readonly skillRegistry: SkillRegistryService,
    @Inject(forwardRef(() => AgentRegistryService))
    private readonly agentRegistry: AgentRegistryService,
    @Inject(forwardRef(() => McpRegistryService))
    private readonly mcpRegistry: McpRegistryService,
    private readonly tracker: SessionTrackerService,
  ) {}

  async bootstrap(projectRoot: string): Promise<PlatformBootstrapResult> {
    const config = await this.configService.readConfig(projectRoot);
    this.config = config;

    if (!config.enabled || !config.projectId) {
      this.status = config.error ? 'error' : 'disabled';
      return { status: this.status, config, message: config.error };
    }

    const apiKey = this.configService.getApiKey(config);
    if (!apiKey) {
      this.status = 'error';
      return {
        status: this.status,
        config,
        message: `Missing platform API key in environment variable ${config.apiKeyEnv}`,
      };
    }
    this.apiKey = apiKey;

    try {
      await this.client.authMe(config, apiKey);
      const payload = await this.client.getProject(config, apiKey);
      const payloadWithTimestamp = { ...payload, fetchedAt: new Date().toISOString() };
      await this.cache.writeProjectCache(projectRoot, payloadWithTimestamp);
      this.applyProjectPayload(payloadWithTimestamp);
      this.status = 'online';
      void this.tracker.start(config, apiKey, config.projectId, {
        castVersion,
        os: `${os.platform()} ${os.release()}`,
        nodeVersion: process.version,
      }).catch(() => undefined);
      return {
        status: this.status,
        config,
        project: this.project || undefined,
        features: this.features || undefined,
        source: 'remote',
      };
    } catch (error) {
      const cached = await this.cache.readProjectCache(projectRoot);
      if (this.cache.isProjectCacheUsable(cached)) {
        this.applyProjectPayload(cached!);
        this.status = 'offline';
        return {
          status: this.status,
          config,
          project: this.project || undefined,
          features: this.features || undefined,
          source: 'cache',
          message: (error as Error).message,
        };
      }

      this.status = 'offline';
      return { status: this.status, config, message: (error as Error).message };
    }
  }

  getStatus(): PlatformStatus {
    return this.status;
  }

  getFeatures(): PlatformFeatures | null {
    return this.features;
  }

  getProject(): PlatformProjectPayload['project'] | null {
    return this.project;
  }

  isRagEnabled(): boolean {
    return this.status !== 'disabled' && Boolean(this.settings?.ragEnabled && this.config && this.apiKey);
  }

  getRagInstruction(): string {
    if (!this.isRagEnabled()) return '';
    const instruction = this.settings?.rag?.agentInstruction?.trim();
    return instruction || 'Use rag_search when you need project documentation, indexed decisions, or knowledge from the Cast platform memory.';
  }

  async retrieveMemory(query: string, topK?: number): Promise<PlatformMemoryRetrieval> {
    if (!this.config || !this.apiKey || !this.isRagEnabled()) {
      throw new Error('Platform RAG is not enabled for this project.');
    }
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      throw new Error('RAG query cannot be empty.');
    }
    const defaultTopK = this.settings?.rag?.topK ?? 5;
    return this.client.retrieveMemory(this.config, this.apiKey, {
      query: cleanQuery,
      topK: topK ?? defaultTopK,
    });
  }

  async memoryOverview(): Promise<PlatformMemoryOverview> {
    if (!this.config || !this.apiKey || !this.isRagEnabled()) {
      throw new Error('Platform RAG is not enabled for this project.');
    }
    return this.client.memoryOverview(this.config, this.apiKey);
  }

  async markMemoryUsed(retrievalId: string, unitIds: string[]): Promise<PlatformMemoryUsageResponse> {
    if (!this.config || !this.apiKey || !this.isRagEnabled()) {
      throw new Error('Platform RAG is not enabled for this project.');
    }
    const cleanRetrievalId = retrievalId.trim();
    const cleanUnitIds = [...new Set(unitIds.map((unitId) => unitId.trim()).filter(Boolean))];
    if (!cleanRetrievalId || cleanUnitIds.length === 0) {
      return { accepted: 0 };
    }
    return this.client.markMemoryUsed(this.config, this.apiKey, {
      retrievalId: cleanRetrievalId,
      unitIds: cleanUnitIds,
    });
  }

  track(type: PlatformEventType, payload: Record<string, unknown>): void {
    this.tracker.track(type, payload);
  }

  flush(): Promise<void> {
    return this.tracker.flush();
  }

  close(summary?: { duration?: number; totalTokens?: number; totalCost?: number }): Promise<void> {
    return this.tracker.close(summary);
  }

  private applyProjectPayload(payload: PlatformProjectPayload): void {
    this.project = payload.project;
    this.features = payload.features;
    this.settings = payload.settings ?? null;

    const skills = this.adapter.adaptSkills(payload.skills || []);
    const agents = this.adapter.adaptAgents(payload.agents || []);
    const mcpConfigs = this.adapter.adaptMcpConfigs(payload.mcp || []);
    const overriddenSkills = this.skillRegistry.loadRemoteSkills(skills);
    const overriddenAgents = this.agentRegistry.loadRemoteAgents(agents);
    this.mcpRegistry.loadConfigs(mcpConfigs);

    for (const name of overriddenSkills) {
      process.stdout.write(`[platform] skill "${name}" overridden by remote platform version\r\n`);
    }
    for (const name of overriddenAgents) {
      process.stdout.write(`[platform] agent "${name}" overridden by remote platform version\r\n`);
    }
  }
}
