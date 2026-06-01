import { Injectable } from '@nestjs/common';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { SkillLoaderService } from '../../skills/services/skill-loader.service';
import { CastEnvironmentProfile, EnvironmentReadinessReport, ResolvedCastEnvironmentManifest } from '../types';
import { EnvironmentActivationService } from './environment-activation.service';
import { EnvironmentLoaderService } from './environment-loader.service';
import { EnvironmentReadinessService } from './environment-readiness.service';

@Injectable()
export class EnvironmentResolverService {
  constructor(
    private readonly loader: EnvironmentLoaderService,
    private readonly activation: EnvironmentActivationService,
    private readonly readiness: EnvironmentReadinessService,
    private readonly agentRegistry: AgentRegistryService,
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
    const environment = await this.loader.get(active.environmentId, projectRoot);
    if (!environment) {
      return null;
    }
    return active.profileId
      ? this.resolveProfile(environment, active.profileId) ?? environment
      : environment;
  }

  async applyActiveScope(projectRoot: string): Promise<ResolvedCastEnvironmentManifest | null> {
    const environment = await this.getActive(projectRoot);
    if (!environment) {
      this.agentRegistry.clearActiveEnvironmentScope();
      this.skillLoader.clearActiveEnvironmentScope();
      this.mcpRegistry.clearActiveEnvironmentScope();
      return null;
    }

    const strict = Boolean(environment.activeProfile);
    this.agentRegistry.setActiveEnvironmentScope(environment.id, this.agentNames(environment), { strict });
    this.skillLoader.setActiveEnvironmentScope(environment.id, this.skillNames(environment), { strict });
    this.mcpRegistry.setActiveEnvironmentScope(environment.id, this.mcpNames(environment), { strict });
    return environment;
  }

  async inspect(projectRoot: string, environmentId: string, profileId?: string): Promise<{
    manifest: ResolvedCastEnvironmentManifest;
    readiness: EnvironmentReadinessReport;
  } | null> {
    const environment = await this.resolve(environmentId, projectRoot);
    const manifest = profileId && environment
      ? this.resolveProfile(environment, profileId)
      : environment;
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
      `- Profile: ${environment.activeProfile ?? 'none'}`,
      `- Description: ${environment.description}`,
      `- Default agent: ${environment.defaultAgent}`,
      `- Agents: ${this.agentNames(environment).join(', ') || 'none'}`,
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

  resolveProfile(
    environment: ResolvedCastEnvironmentManifest,
    profileId: string,
  ): ResolvedCastEnvironmentManifest | null {
    const profile = environment.profiles[profileId];
    if (!profile) {
      return null;
    }

    return {
      ...environment,
      activeProfile: profileId,
      description: profile.description || environment.description,
      defaultAgent: profile.defaultAgent || environment.defaultAgent,
      agents: this.mergeMembers(environment.agents, profile.agents),
      skills: this.mergeMembers(environment.skills, profile.skills),
      mcp: profile.mcp && this.hasMcpEntries(profile.mcp) ? profile.mcp : environment.mcp,
      permissions: profile.permissions ?? environment.permissions,
      rag: profile.rag ?? environment.rag,
      benchmarks: profile.benchmarks && profile.benchmarks.smoke.length > 0 ? profile.benchmarks : environment.benchmarks,
      schedules: profile.schedules && profile.schedules.suggested.length > 0 ? profile.schedules : environment.schedules,
    };
  }

  private mergeMembers<T extends { required: string[]; optional: string[] }>(
    base: T,
    profile?: CastEnvironmentProfile['agents'] | CastEnvironmentProfile['skills'],
  ): T {
    if (!profile || (profile.required.length === 0 && profile.optional.length === 0)) {
      return base;
    }
    return {
      required: profile.required,
      optional: profile.optional,
    } as T;
  }

  private hasMcpEntries(mcp: { required?: string[]; recommended: string[] }): boolean {
    return (mcp.required?.length ?? 0) > 0 || mcp.recommended.length > 0;
  }

  private skillNames(environment: ResolvedCastEnvironmentManifest): string[] {
    return [...new Set([...environment.skills.required, ...environment.skills.optional])];
  }

  private agentNames(environment: ResolvedCastEnvironmentManifest): string[] {
    return [...new Set([environment.defaultAgent, ...environment.agents.required, ...environment.agents.optional])];
  }

  private mcpNames(environment: ResolvedCastEnvironmentManifest): string[] {
    return [...new Set([...(environment.mcp.required ?? []), ...environment.mcp.recommended])];
  }
}
