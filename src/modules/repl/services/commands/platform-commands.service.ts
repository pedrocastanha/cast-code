import { Injectable } from '@nestjs/common';
import { PlatformConfigService } from '../../../platform/services/platform-config.service';
import { PlatformService } from '../../../platform/services/platform.service';
import { PlatformLinkOptions } from '../../../platform/types';
import { ConfigManagerService } from '../../../config/services/config-manager.service';
import { ISmartInput } from '../smart-input';
import { CommandUiService } from '../command-ui.service';
import { colorize } from '../../utils/theme';

type ParsedLinkArgs = {
  projectId?: string;
  apiUrl?: string;
  apiKey?: string;
};

@Injectable()
export class PlatformCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly configService: PlatformConfigService,
    private readonly platformService: PlatformService,
    private readonly configManager: ConfigManagerService,
  ) {}

  async cmdPlatform(args: string[], smartInput?: ISmartInput): Promise<boolean> {
    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'status') {
      await this.platformService.bootstrap(process.cwd());
      await this.showStatus();
      return false;
    }

    if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
      this.printHelp();
      return false;
    }

    const options = await this.resolvePlatformOptions(args, smartInput);
    if (!options) {
      return false;
    }

    const projectRoot = process.cwd();
    await this.savePlatformConfig(options.apiUrl, options.apiKey);
    await this.configService.writeLink(projectRoot, {
      projectId: options.projectId,
      apiUrl: options.apiUrl,
      apiKeyEnv: 'CAST_API_KEY',
    });

    process.stdout.write(this.ui.panel({
      title: 'Cast Platform',
      subtitle: 'configured',
      sections: [
        {
          rows: [
            { label: 'Directory', value: colorize(projectRoot, 'cyan') },
            { label: 'Project ID', value: colorize(options.projectId, 'cyan') },
            { label: 'API URL', value: colorize(options.apiUrl, 'cyan') },
            { label: 'Key', value: colorize('stored globally', 'success') },
          ],
        },
      ],
      footer: 'Project link saved to .cast/cast.yaml. API key values stay only in the global Cast config.',
    }));

    const result = await this.platformService.bootstrap(projectRoot);
    if (result.status === 'online' || result.status === 'offline') {
      const projectName = result.project?.name || options.projectId;
      const source = result.source === 'cache' ? 'cached platform context' : 'remote platform context';
      process.stdout.write(this.ui.success(`Platform configured for ${projectName}. Loaded ${source}.`));
      return true;
    }

    const message = result.message || 'Could not verify the platform connection.';
    process.stdout.write(this.ui.warning(`Platform config saved, but verification failed: ${message}`));
    return false;
  }

  async cmdLink(args: string[], smartInput?: ISmartInput): Promise<boolean> {
    process.stdout.write(this.ui.warning('/link was removed. Use /platform to configure the API URL, global key, and current project link in one flow.'));
    return this.cmdPlatform(args, smartInput);
  }

  private async resolvePlatformOptions(args: string[], smartInput?: ISmartInput): Promise<PlatformLinkOptions & { apiUrl: string; apiKey?: string } | null> {
    const parsed = this.parseArgs(args);
    await this.configManager.loadConfig();
    const globalConfig = this.configManager.getConfig().platform || {};
    const current = await this.configService.readConfig(process.cwd());
    const apiUrlDefault = globalConfig.apiUrl || current.apiUrl;

    if (parsed.projectId) {
      return {
        projectId: parsed.projectId,
        apiUrl: parsed.apiUrl || apiUrlDefault,
        ...(parsed.apiKey ? { apiKey: parsed.apiKey } : {}),
        apiKeyEnv: 'CAST_API_KEY',
      };
    }

    if (!smartInput) {
      this.printHelp();
      return null;
    }

    process.stdout.write(this.ui.panel({
      title: 'Cast Platform',
      subtitle: 'setup',
      sections: [
        {
          lines: [
            `${colorize('Directory', 'muted')} ${colorize(process.cwd(), 'cyan')}`,
            colorize('This configures the platform URL, global API key, and current project link in one place.', 'muted'),
          ],
        },
      ],
      footer: 'Leave API key blank to keep the existing global key.',
    }));

    const projectPrompt = current.projectId ? `Project ID (${current.projectId}):` : 'Project ID:';
    const projectId = (await smartInput.question(projectPrompt)).trim() || current.projectId;
    if (!projectId) {
      process.stdout.write(this.ui.warning('Platform setup cancelled. Project ID is required.'));
      return null;
    }

    const apiUrl = (await smartInput.question(`Platform API URL (${apiUrlDefault}):`)).trim() || apiUrlDefault;
    const apiUrlError = this.validateApiUrl(apiUrl);
    if (apiUrlError) {
      process.stdout.write(this.ui.error(apiUrlError));
      return null;
    }

    const hasExistingKey = Boolean(globalConfig.apiKey?.trim());
    const apiKeyAnswer = (await smartInput.question(`Platform API key${hasExistingKey ? ' (blank keeps current)' : ''}:`)).trim();
    const apiKey = apiKeyAnswer || globalConfig.apiKey;
    if (!apiKey) {
      process.stdout.write(this.ui.warning('Platform setup cancelled. API key is required for verification and remote skills.'));
      return null;
    }

    return {
      projectId,
      apiUrl,
      apiKey,
      apiKeyEnv: 'CAST_API_KEY',
    };
  }

  private async savePlatformConfig(apiUrl: string, apiKey?: string): Promise<void> {
    await this.configManager.loadConfig();
    const current = this.configManager.getConfig().platform || {};
    await this.configManager.setPlatformConfig({
      apiUrl,
      ...(apiKey || current.apiKey ? { apiKey: apiKey || current.apiKey } : {}),
    });
  }

  private parseArgs(args: string[]): ParsedLinkArgs {
    const parsed: ParsedLinkArgs = {};
    const positional: string[] = [];

    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg === '--project' || arg === '-p') {
        parsed.projectId = args[i + 1];
        i += 1;
        continue;
      }
      if (arg === '--api-url') {
        parsed.apiUrl = args[i + 1];
        i += 1;
        continue;
      }
      if (arg === '--api-key-env') {
        i += 1;
        continue;
      }
      if (arg === '--api-key') {
        parsed.apiKey = args[i + 1];
        i += 1;
        continue;
      }
      if (!arg.startsWith('-')) {
        positional.push(arg);
      }
    }

    if (!parsed.projectId && positional[0]) {
      parsed.projectId = positional[0];
    }

    return parsed;
  }

  private async showStatus(): Promise<void> {
    const config = await this.configService.readConfig(process.cwd());
    const keyPresent = Boolean(this.configService.getApiKey(config));
    const runtimeStatus = this.platformService.getStatus();
    const project = this.platformService.getProject();
    const ragStatus = this.platformService.isRagEnabled() ? colorize('enabled', 'success') : colorize('not active', 'muted');

    process.stdout.write(this.ui.panel({
      title: 'Cast Platform',
      subtitle: runtimeStatus,
      sections: [
        {
          rows: [
            { label: 'Directory', value: colorize(config.projectRoot, 'cyan') },
            { label: 'Project ID', value: config.projectId ? colorize(config.projectId, 'cyan') : colorize('not linked', 'muted') },
            { label: 'Project', value: project?.name ? colorize(project.name, 'cyan') : colorize('not loaded', 'muted') },
            { label: 'API URL', value: colorize(config.apiUrl, 'muted') },
            { label: 'Key env', value: colorize(config.apiKeyEnv, 'muted') },
            { label: 'Key', value: keyPresent ? colorize('present', 'success') : colorize('missing', 'warning') },
            { label: 'RAG', value: ragStatus },
          ],
        },
      ],
      footer: 'Key values are read from global Cast config or the environment and are never printed or stored in .cast/cast.yaml.',
    }));
  }

  private printHelp(): void {
    process.stdout.write(this.ui.panel({
      title: 'Cast Platform',
      subtitle: 'commands',
      sections: [
        {
          lines: [
            `${colorize('/platform', 'cyan')} ${colorize('configure API URL, global key, and current project link', 'muted')}`,
            `${colorize('/platform --project <id>', 'cyan')} ${colorize('link current directory using the global platform key', 'muted')}`,
            `${colorize('/platform --project <id> --api-url <url>', 'cyan')} ${colorize('override the platform API URL', 'muted')}`,
            `${colorize('/platform status', 'cyan')} ${colorize('show current platform status', 'muted')}`,
          ],
        },
      ],
      footer: 'Use the same project id in multiple directories when they belong to the same platform project.',
    }));
  }

  private validateApiUrl(apiUrl: string): string | undefined {
    try {
      const parsed = new URL(apiUrl);
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
        return 'Platform API URL must use HTTPS unless it points to localhost.';
      }
      return undefined;
    } catch {
      return 'Platform API URL is invalid.';
    }
  }
}
