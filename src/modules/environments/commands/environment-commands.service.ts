import { Injectable, Optional } from '@nestjs/common';
import { ProjectLoaderService } from '../../project/services/project-loader.service';
import { EnvironmentActivationService } from '../services/environment-activation.service';
import { EnvironmentResolverService } from '../services/environment-resolver.service';
import { EnvironmentReadinessReport, ResolvedCastEnvironmentManifest } from '../types';

type DeepAgentRefresh = {
  initialize?: () => Promise<unknown>;
  reinitializeModel?: () => Promise<void>;
  refreshEnvironmentContext?: () => Promise<void>;
};

@Injectable()
export class EnvironmentCommandsService {
  private agentRefresh: DeepAgentRefresh | null = null;

  constructor(
    private readonly resolver: EnvironmentResolverService,
    private readonly activation: EnvironmentActivationService,
    @Optional()
    private readonly projectLoader?: ProjectLoaderService,
  ) {}

  setAgentRefresh(agentRefresh: DeepAgentRefresh): void {
    this.agentRefresh = agentRefresh;
  }

  async cmdEnv(args: string[]): Promise<void> {
    const subcommand = (args[0] ?? 'list').toLowerCase();
    switch (subcommand) {
    case 'list':
      await this.list();
      return;
    case 'use':
      await this.use(args.slice(1));
      return;
    case 'inspect':
      await this.inspect(args.slice(1));
      return;
    case 'profiles':
      await this.profiles(args[1]);
      return;
    case 'help':
    default:
      this.printHelp();
    }
  }

  private async list(): Promise<void> {
    const projectRoot = await this.getProjectRoot();
    const environments = await this.resolver.list(projectRoot);
    const active = await this.resolver.getActive(projectRoot);

    if (environments.length === 0) {
      process.stdout.write('No Cast environments found.\n');
      return;
    }

    process.stdout.write('Cast environments:\n');
    for (const environment of environments) {
      const marker = active?.id === environment.id ? '*' : ' ';
      const origin = environment.source === 'project' ? 'project' : 'built-in';
      process.stdout.write(`${marker} ${environment.id.padEnd(12)} ${environment.name} (${origin})\n`);
      process.stdout.write(`  ${environment.description}\n`);
    }
    process.stdout.write('\nUse /env use <id> to activate an environment.\n');
  }

  private async use(args: string[]): Promise<void> {
    const { environmentId, profileId } = this.parseEnvironmentArgs(args);
    if (!environmentId) {
      process.stdout.write('Usage: /env use <environment-id> [--profile <profile-id>]\n');
      return;
    }

    const projectRoot = await this.getProjectRoot();
    const environment = await this.resolver.resolve(environmentId, projectRoot);
    if (!environment) {
      process.stdout.write(`Environment not found: ${environmentId}\n`);
      return;
    }

    const manifest = profileId ? this.resolver.resolveProfile(environment, profileId) : environment;
    if (!manifest) {
      process.stdout.write(`Profile not found: ${environment.id}:${profileId}\n`);
      return;
    }

    await this.activation.activate(projectRoot, environment, profileId);
    const readiness = await this.resolver.inspect(projectRoot, environment.id, profileId);
    await this.resolver.applyActiveScope(projectRoot);
    await this.refreshAgentBestEffort();

    process.stdout.write(`Active Cast environment: ${environment.id} (${environment.name})${profileId ? ` profile ${profileId}` : ''}\n`);
    if (readiness) {
      this.printReadiness(readiness.readiness);
    }
  }

  private async inspect(args: string[]): Promise<void> {
    const { environmentId, profileId } = this.parseEnvironmentArgs(args);
    const projectRoot = await this.getProjectRoot();
    const target = environmentId
      ? await this.resolver.resolve(environmentId, projectRoot)
      : await this.resolver.getActive(projectRoot);

    if (!target) {
      process.stdout.write(environmentId
        ? `Environment not found: ${environmentId}\n`
        : 'No active Cast environment. Run /env list or /env use <id>.\n');
      return;
    }

    const inspection = await this.resolver.inspect(projectRoot, target.id, profileId);
    if (!inspection) {
      process.stdout.write(profileId ? `Profile not found: ${target.id}:${profileId}\n` : `Environment not found: ${target.id}\n`);
      return;
    }

    this.printManifest(inspection.manifest);
    this.printReadiness(inspection.readiness);
  }

  private async profiles(environmentId?: string): Promise<void> {
    const projectRoot = await this.getProjectRoot();
    const target = environmentId
      ? await this.resolver.resolve(environmentId, projectRoot)
      : await this.resolver.getActive(projectRoot);

    if (!target) {
      process.stdout.write(environmentId
        ? `Environment not found: ${environmentId}\n`
        : 'No active Cast environment. Run /env list or /env use <id>.\n');
      return;
    }

    const entries = Object.entries(target.profiles);
    if (entries.length === 0) {
      process.stdout.write(`Environment ${target.id} has no profiles.\n`);
      return;
    }

    process.stdout.write(`Profiles for ${target.id}:\n`);
    for (const [id, profile] of entries) {
      process.stdout.write(`- ${id}: ${profile.description || 'No description'}\n`);
    }
  }

  private printManifest(environment: ResolvedCastEnvironmentManifest): void {
    process.stdout.write(`Environment: ${environment.id} (${environment.name})\n`);
    if (environment.activeProfile) {
      process.stdout.write(`Profile: ${environment.activeProfile}\n`);
    }
    process.stdout.write(`${environment.description}\n`);
    process.stdout.write(`Source: ${environment.source}\n`);
    process.stdout.write(`Default agent: ${environment.defaultAgent}\n`);
    process.stdout.write(`Agents: ${[environment.defaultAgent, ...environment.agents.required, ...environment.agents.optional].join(', ') || 'none'}\n`);
    process.stdout.write(`Skills: ${[...environment.skills.required, ...environment.skills.optional].join(', ') || 'none'}\n`);
    process.stdout.write(`MCPs: ${[...(environment.mcp.required ?? []), ...environment.mcp.recommended].join(', ') || 'none'}\n`);
    process.stdout.write(`Permission mode: ${environment.permissions.defaultMode}\n`);
    process.stdout.write(`Requires approval: ${environment.permissions.requireApproval.join(', ') || 'none'}\n`);
    process.stdout.write(`RAG sources: ${environment.rag.recommendedSources.join(', ') || 'none'}\n`);
    process.stdout.write(`Smoke benchmarks: ${environment.benchmarks.smoke.join(', ') || 'none'}\n`);
    process.stdout.write(`Suggested schedules: ${environment.schedules.suggested.join(', ') || 'none'}\n`);
    const profiles = Object.keys(environment.profiles);
    process.stdout.write(`Profiles: ${profiles.join(', ') || 'none'}\n`);
  }

  private printReadiness(readiness: EnvironmentReadinessReport): void {
    process.stdout.write(`Readiness: ${readiness.status}\n`);
    for (const check of readiness.checks) {
      const marker = check.status === 'ready' ? 'ok' : check.status;
      process.stdout.write(`- ${marker} ${check.kind}:${check.id} ${check.message}\n`);
    }
  }

  private printHelp(): void {
    process.stdout.write([
      'Environment commands:',
      '- /env list',
      '- /env use <environment-id> [--profile <profile-id>]',
      '- /env inspect [environment-id] [--profile <profile-id>]',
      '- /env profiles [environment-id]',
    ].join('\n') + '\n');
  }

  private parseEnvironmentArgs(args: string[]): { environmentId?: string; profileId?: string } {
    const environmentId = args.find((arg) => arg && !arg.startsWith('--'));
    const profileFlagIndex = args.findIndex((arg) => arg === '--profile');
    const profileId = profileFlagIndex >= 0 ? args[profileFlagIndex + 1] : undefined;
    return { environmentId, profileId };
  }

  private async refreshAgentBestEffort(): Promise<void> {
    try {
      if (this.agentRefresh?.refreshEnvironmentContext) {
        await this.agentRefresh.refreshEnvironmentContext();
      } else if (this.agentRefresh?.reinitializeModel) {
        await this.agentRefresh.reinitializeModel();
      } else {
        await this.agentRefresh?.initialize?.();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`Environment activated, but agent refresh failed: ${message}\n`);
    }
  }

  private async getProjectRoot(): Promise<string> {
    return (await this.projectLoader?.detectProject()) ?? process.cwd();
  }
}
