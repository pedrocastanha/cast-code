import { Injectable } from '@nestjs/common';
import { BenchmarkStoreService } from '../../benchmark/services/benchmark-store.service';
import { getTemplate } from '../../mcp/catalog/mcp-templates';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { SkillLoaderService } from '../../skills/services/skill-loader.service';
import {
  EnvironmentReadinessCheck,
  EnvironmentReadinessReport,
  EnvironmentReadinessStatus,
  ResolvedCastEnvironmentManifest,
} from '../types';
import { DEFAULT_ENVIRONMENT_BENCHMARKS } from './environment-default-benchmarks';

@Injectable()
export class EnvironmentReadinessService {
  constructor(
    private readonly skillLoader: SkillLoaderService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly benchmarkStore: BenchmarkStoreService,
  ) {}

  async inspect(projectRoot: string, manifest: ResolvedCastEnvironmentManifest): Promise<EnvironmentReadinessReport> {
    const checks: EnvironmentReadinessCheck[] = [];
    const skills = new Set(this.skillLoader.getUnscopedSkillNames());
    const mcpSummaries = new Set(this.mcpRegistry.getUnscopedServerNames());
    const benchmarkDefinitions = new Set((await this.benchmarkStore.listDefinitions(projectRoot)).map((definition) => definition.id));

    for (const skillName of manifest.skills.required) {
      checks.push({
        kind: 'skill',
        id: skillName,
        status: skills.has(skillName) ? 'ready' : 'blocked',
        message: skills.has(skillName) ? `Skill ${skillName} loaded.` : `Required skill ${skillName} is missing.`,
      });
    }

    for (const mcpName of manifest.mcp.required ?? []) {
      checks.push({
        kind: 'mcp',
        id: mcpName,
        status: mcpSummaries.has(mcpName) ? 'ready' : 'blocked',
        message: mcpSummaries.has(mcpName) ? `MCP ${mcpName} configured.` : `Required MCP ${mcpName} is not configured.`,
      });
    }

    for (const mcpName of manifest.mcp.recommended) {
      if ((manifest.mcp.required ?? []).includes(mcpName)) {
        continue;
      }
      const template = getTemplate(mcpName);
      checks.push({
        kind: 'mcp',
        id: mcpName,
        status: mcpSummaries.has(mcpName) ? 'ready' : 'warning',
        message: mcpSummaries.has(mcpName)
          ? `Recommended MCP ${mcpName} configured.`
          : `Recommended MCP ${mcpName}${template ? ` (${template.name})` : ''} is not configured.`,
      });
    }

    for (const source of manifest.rag.recommendedSources) {
      checks.push({
        kind: 'rag',
        id: source,
        status: 'warning',
        message: `Recommended RAG source ${source} should be indexed in the platform for this environment.`,
      });
    }

    for (const benchmarkId of manifest.benchmarks.smoke) {
      const available = benchmarkDefinitions.has(benchmarkId) || Boolean(DEFAULT_ENVIRONMENT_BENCHMARKS[benchmarkId]);
      checks.push({
        kind: 'benchmark',
        id: benchmarkId,
        status: available ? 'ready' : 'warning',
        message: available ? `Smoke benchmark ${benchmarkId} is available.` : `Smoke benchmark ${benchmarkId} has no local definition yet.`,
      });
    }

    return {
      environmentId: manifest.id,
      status: this.aggregate(checks),
      checks,
    };
  }

  private aggregate(checks: EnvironmentReadinessCheck[]): EnvironmentReadinessStatus {
    if (checks.some((check) => check.status === 'blocked')) {
      return 'blocked';
    }
    if (checks.some((check) => check.status === 'warning')) {
      return 'warning';
    }
    return 'ready';
  }
}
