import { Injectable } from '@nestjs/common';
import { CastLinkService } from '../../../platform/services/cast-link.service';
import { PlatformConfigService } from '../../../platform/services/platform-config.service';
import { PlatformService } from '../../../platform/services/platform.service';
import { PlatformLinkOptions } from '../../../platform/types';
import { ISmartInput } from '../smart-input';
import { CommandUiService } from '../command-ui.service';
import { colorize } from '../../utils/theme';

type ParsedLinkArgs = {
  projectId?: string;
  apiUrl?: string;
  apiKeyEnv?: string;
};

@Injectable()
export class PlatformCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly linkService: CastLinkService,
    private readonly configService: PlatformConfigService,
    private readonly platformService: PlatformService,
  ) {}

  async cmdLink(args: string[], smartInput?: ISmartInput): Promise<boolean> {
    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'status') {
      await this.showStatus();
      return false;
    }

    if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
      this.printHelp();
      return false;
    }

    const options = await this.resolveLinkOptions(args, smartInput);
    if (!options) {
      return false;
    }

    const projectRoot = process.cwd();
    process.stdout.write(this.ui.panel({
      title: 'Platform Link',
      subtitle: 'current directory',
      sections: [
        {
          rows: [
            { label: 'Directory', value: colorize(projectRoot, 'cyan') },
            { label: 'Project ID', value: colorize(options.projectId, 'cyan') },
            { label: 'API URL', value: colorize(options.apiUrl || 'default', 'muted') },
            { label: 'Key env', value: colorize(options.apiKeyEnv || 'CAST_API_KEY', 'muted') },
          ],
        },
      ],
      footer: 'This writes .cast/cast.yaml in the current directory. Use /config set-platform for a global key.',
    }));

    const result = await this.linkService.link(projectRoot, options);
    process.stdout.write(result.ok ? this.ui.success(result.message) : this.ui.error(result.message));
    return result.ok;
  }

  private async resolveLinkOptions(args: string[], smartInput?: ISmartInput): Promise<PlatformLinkOptions | null> {
    const parsed = this.parseArgs(args);

    if (parsed.projectId) {
      return {
        projectId: parsed.projectId,
        apiUrl: parsed.apiUrl,
        apiKeyEnv: parsed.apiKeyEnv,
      };
    }

    if (!smartInput) {
      this.printHelp();
      return null;
    }

    const current = await this.configService.readConfig(process.cwd());
    process.stdout.write(this.ui.panel({
      title: 'Platform Link',
      subtitle: 'setup',
      sections: [
        {
          lines: [
            `${colorize('Directory', 'muted')} ${colorize(process.cwd(), 'cyan')}`,
            colorize('Linking is per directory, so the same platform project can be linked from multiple local folders.', 'muted'),
          ],
        },
      ],
      footer: 'Leave API URL and key env blank to use project/global defaults.',
    }));

    const projectId = (await smartInput.question('Project ID:')).trim();
    if (!projectId) {
      process.stdout.write(this.ui.warning('Link cancelled. Project ID is required.'));
      return null;
    }

    const apiUrlAnswer = (await smartInput.question(`Platform API URL (${current.apiUrl}):`)).trim();
    const apiKeyEnvAnswer = (await smartInput.question(`API key env (${current.apiKeyEnv}):`)).trim();
    const apiKeyEnv = this.resolveInteractiveApiKeyEnv(apiKeyEnvAnswer);

    return {
      projectId,
      apiUrl: apiUrlAnswer || undefined,
      apiKeyEnv,
    };
  }

  private resolveInteractiveApiKeyEnv(answer: string): string | undefined {
    if (!answer) {
      return undefined;
    }
    if (this.looksLikeApiKey(answer)) {
      process.env.CAST_API_KEY = answer;
      process.stdout.write(this.ui.warning('API key value received for this session. It will not be stored; the link will use CAST_API_KEY.'));
      return 'CAST_API_KEY';
    }
    return answer;
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
        parsed.apiKeyEnv = args[i + 1];
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
      title: 'Platform Link',
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
      footer: 'Key values are read from the environment or global /config and are never printed or stored in .cast/cast.yaml.',
    }));
  }

  private printHelp(): void {
    process.stdout.write(this.ui.panel({
      title: 'Platform Link',
      subtitle: 'commands',
      sections: [
        {
          lines: [
            `${colorize('/link', 'cyan')} ${colorize('interactive setup for the current directory', 'muted')}`,
            `${colorize('/link --project <id>', 'cyan')} ${colorize('link current directory to a Cast project', 'muted')}`,
            `${colorize('/link --project <id> --api-url <url>', 'cyan')} ${colorize('override the platform API URL', 'muted')}`,
            `${colorize('/link status', 'cyan')} ${colorize('show current directory link status', 'muted')}`,
            `${colorize('/config set-platform', 'cyan')} ${colorize('save a global Cast Platform key and API URL', 'muted')}`,
          ],
        },
      ],
      footer: 'Use the same project id in multiple directories when they belong to the same platform project.',
    }));
  }

  private looksLikeApiKey(value: string): boolean {
    return /^(csk|sk|sk-ant|sk-proj|sk-or|AIza)[_-]/i.test(value);
  }
}
