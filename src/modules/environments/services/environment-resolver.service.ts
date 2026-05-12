import { Injectable } from '@nestjs/common';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { SkillLoaderService } from '../../skills/services/skill-loader.service';
import { EnvironmentReadinessReport, ResolvedCastEnvironmentManifest } from '../types';
import { EnvironmentActivationService } from './environment-activation.service';
import { EnvironmentLoaderService } from './environment-loader.service';
import { EnvironmentReadinessService } from './environment-readiness.service';

@Injectable()
export class EnvironmentResolverService {
  constructor(
    private readonly loader: EnvironmentLoaderService,
    private readonly activation: EnvironmentActivationService,
    private readonly readiness: EnvironmentReadinessService,
    private readonly skillLoader: SkillLoaderService,
    private readonly mcpRegistry: McpRegistryService,
  ) {}

  list(projectRoot: string): Promise<ResolvedCastEnvironmentManifest[]> {
    return this.loader.list(projectRoot);
  }

  resolve(id: string, projectRoot: string): Promise<ResolvedCastEnvironmentManifest | null> {
    return this.loader.get(id, projectRoot);
  }

  async getActive(projectRoot: string): Promise<ResolvedCastEnvironmentManifest | null> {
    const active = await this.activation.getActive(projectRoot);
    if (!active) {
      return null;
    }
    return this.loader.get(active.environmentId, projectRoot);
  }

  async applyActiveScope(projectRoot: string): Promise<ResolvedCastEnvironmentManifest | null> {
    const environment = await this.getActive(projectRoot);
    if (!environment) {
      this.skillLoader.clearActiveEnvironmentScope();
      this.mcpRegistry.clearActiveEnvironmentScope();
      return null;
    }

    this.skillLoader.setActiveEnvironmentScope(environment.id, this.skillNames(environment));
    this.mcpRegistry.setActiveEnvironmentScope(environment.id, this.mcpNames(environment));
    return environment;
  }

  async inspect(projectRoot: string, environmentId: string): Promise<{
    manifest: ResolvedCastEnvironmentManifest;
    readiness: EnvironmentReadinessReport;
  } | null> {
    const manifest = await this.resolve(environmentId, projectRoot);
    if (!manifest) {
      return null;
    }
    return {
      manifest,
      readiness: await this.readiness.inspect(projectRoot, manifest),
    };
  }

  async buildActiveEnvironmentPrompt(projectRoot: string): Promise<string> {
    const environment = await this.applyActiveScope(projectRoot);
    if (!environment) {
      return '';
    }

    const report = await this.readiness.inspect(projectRoot, environment);
    const approval = environment.permissions.requireApproval.length > 0
      ? environment.permissions.requireApproval.join(', ')
      : 'none';
    const lines = [
      '# Active Cast Environment',
      `- Id: ${environment.id}`,
      `- Name: ${environment.name}`,
      `- Description: ${environment.description}`,
      `- Default agent: ${environment.defaultAgent}`,
      `- Skills: ${this.skillNames(environment).join(', ') || 'none'}`,
      `- Recommended MCPs: ${this.mcpNames(environment).join(', ') || 'none'}`,
      `- Permission mode: ${environment.permissions.defaultMode}`,
      `- Requires approval for: ${approval}`,
      `- Smoke benchmarks: ${environment.benchmarks.smoke.join(', ') || 'none'}`,
      `- Readiness: ${report.status}`,
    ];

    const blockers = report.checks.filter((check) => check.status !== 'ready').slice(0, 6);
    if (blockers.length > 0) {
      lines.push('- Readiness notes:');
      for (const check of blockers) {
        lines.push(`  - ${check.status}: ${check.message}`);
      }
    }

    return lines.join('\n');
  }

  private skillNames(environment: ResolvedCastEnvironmentManifest): string[] {
    return [...new Set([...environment.skills.required, ...environment.skills.optional])];
  }

  private mcpNames(environment: ResolvedCastEnvironmentManifest): string[] {
    return [...new Set([...(environment.mcp.required ?? []), ...environment.mcp.recommended])];
  }
}
