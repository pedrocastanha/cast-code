import { Injectable } from '@nestjs/common';
import { PlatformClientService } from './platform-client.service';
import { PlatformConfigService } from './platform-config.service';
import { PlatformLinkOptions } from '../types';

export interface CastLinkResult {
  ok: boolean;
  status: 'linked' | 'linked-offline' | 'error';
  message: string;
}

@Injectable()
export class CastLinkService {
  constructor(
    private readonly configService: PlatformConfigService,
    private readonly client: PlatformClientService,
  ) {}

  async link(projectRoot: string, options: PlatformLinkOptions): Promise<CastLinkResult> {
    if (!options.projectId) {
      return {
        ok: false,
        status: 'error',
        message: 'Usage: cast link --project <projectId> [--api-url <url>] [--api-key-env <name>]',
      };
    }

    const candidate = this.configService.buildConfig(projectRoot, options);
    if (!candidate.enabled) {
      return {
        ok: false,
        status: 'error',
        message: candidate.error || 'Platform configuration is invalid.',
      };
    }
    const config = candidate;

    const apiKey = this.configService.getApiKey(config);
    if (!apiKey) {
      await this.configService.writeLink(projectRoot, options);
      return {
        ok: true,
        status: 'linked-offline',
        message: `Linked project ${options.projectId}. Set ${config.apiKeyEnv} to verify the platform connection.`,
      };
    }

    try {
      await this.client.authMe(config, apiKey);
      const project = await this.client.getProject(config, apiKey);
      await this.configService.writeLink(projectRoot, options);
      return {
        ok: true,
        status: 'linked',
        message: `Linked to "${project.project.name}" (${project.skills.length} skills, ${project.agents.length} agents).`,
      };
    } catch {
      return {
        ok: false,
        status: 'error',
        message: `Could not verify project ${options.projectId}. Check the API key, project id, and API URL before linking.`,
      };
    }
  }
}
