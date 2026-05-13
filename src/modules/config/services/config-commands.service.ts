import { Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { ConfigManagerService } from './config-manager.service';
import { InitConfigService } from './init-config.service';
import {
  getProviderEndpointLabel,
  ProviderType,
  PROVIDER_METADATA,
  MODEL_PURPOSES,
  ModelPurpose,
  getModelChoicesForPurpose,
  getRecommendedModel,
  isRecommendedModelForPurpose,
  providerAllowsOptionalApiKey,
  providerRequiresBaseUrl,
  providerSupportsApiKey,
} from '../types/config.types';
import {
  selectWithEsc,
  inputWithEsc,
  confirmWithEsc,
  withEsc,
} from '../../repl/utils/prompts-with-esc';
import { ISmartInput } from '../../repl/services/smart-input';
import { I18nService } from '../../i18n/services/i18n.service';
import { CommandUiService } from '../../repl/services/command-ui.service';
import { colorize } from '../../repl/utils/theme';

@Injectable()
export class ConfigCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly configManager: ConfigManagerService,
    private readonly initService: InitConfigService,
    private readonly i18nService: I18nService,
  ) { }

  async handleConfigCommand(args: string[], smartInput?: ISmartInput): Promise<void> {
    const subcommand = args[0];
    const useInquirerFlow = ['init', 'setup', 'add-provider', 'set-model', 'set-api-key', 'remove-provider'].includes(subcommand || '');

    if (useInquirerFlow) {
      smartInput?.pause();
    }

    try {
      switch (subcommand) {
      case 'init':
      case 'setup':
        await this.withEscHandler(() => this.initService.runInitialSetup());
        break;

      case 'show':
        await this.showConfig();
        break;

      case 'add-provider':
        await this.withEscHandler(() => this.addProviderInteractive());
        break;

      case 'set-model':
        await this.withEscHandler(() => this.setModelInteractive());
        break;

      case 'set-api-key':
        await this.withEscHandler(() => this.setApiKeyInteractive());
        break;

      case 'remove-provider':
        await this.withEscHandler(() => this.removeProviderInteractive());
        break;

      case 'path':
        process.stdout.write(this.ui.panel({
          title: 'Config Path',
          sections: [{ lines: [colorize(this.configManager.getConfigPath(), 'cyan')] }],
        }));
        break;

      case 'edit-template':
        await this.editTemplateInteractive(smartInput);
        break;

      default:
        if (smartInput) {
          await this.showConfigMenu(smartInput);
        } else {
          await this.showConfig();
        }
      }
    } finally {
      if (useInquirerFlow) {
        smartInput?.resume();
      }
    }
  }

  private async withEscHandler<T>(fn: () => Promise<T>): Promise<void> {
    const result = await withEsc(fn);
    if (result === null) {
      this.warning('Cancelled. Returning to menu...');
    }
  }

  private async showConfigMenu(smartInput: ISmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    await this.configManager.loadConfig();

    while (true) {
      w(this.ui.panel({
        title: 'Cast Code Configuration',
        subtitle: 'settings',
        sections: [{ lines: [colorize('Choose what to inspect or change.', 'muted')] }],
        footer: 'Use Esc to return to chat.',
      }));

      const action = await withEsc(() => smartInput.askChoice('What would you like to do?', [
        { key: '1', label: 'View current configuration', description: 'Show providers and models' },
        { key: '2', label: 'Full initial setup', description: 'Setup wizard' },
        { key: '3', label: 'Add provider', description: 'New AI service' },
        { key: '4', label: 'Remove provider', description: 'Remove service' },
        { key: '5', label: 'Configure model', description: 'Set model for a purpose' },
        { key: '6', label: 'Change API key', description: 'Update provider credential' },
        { key: '7', label: 'Configure Remote UI', description: 'Enable/Disable or change password' },
        { key: '8', label: 'View config file path', description: 'Location of config.yaml' },
        { key: 'l', label: 'Change language', description: 'Switch UI language' },
        { key: 't', label: 'Edit prompt template', description: 'Customize AI system prompts' },
        { key: '9', label: 'Exit', description: 'Return to chat' },
      ]));

      if (action === null) {
        this.warning('Exiting configuration menu...');
        return;
      }

      switch (action) {
      case '1':
        await this.showConfig();
        break;
      case '2':
        await this.runInquirerFlow(smartInput, () => this.initService.runInitialSetup());
        return;
      case '3':
        await this.runInquirerFlow(smartInput, () => this.addProviderInteractive());
        break;
      case '4':
        await this.runInquirerFlow(smartInput, () => this.removeProviderInteractive());
        break;
      case '5':
        await this.runInquirerFlow(smartInput, () => this.setModelInteractive());
        break;
      case '6':
        await this.runInquirerFlow(smartInput, () => this.setApiKeyInteractive());
        break;
      case '7':
        await this.runInquirerFlow(smartInput, () => this.setRemoteInteractive());
        break;
      case '8':
        w(this.ui.panel({
          title: 'Config Path',
          sections: [{ lines: [colorize(this.configManager.getConfigPath(), 'cyan')] }],
        }));
        break;
      case 'l':
        await this.runInquirerFlow(smartInput, () => this.changeLanguageInteractive());
        break;
      case 't':
        await this.editTemplateInteractive(smartInput);
        break;
      case '9':
        return;
      }
    }
  }

  private async runInquirerFlow(smartInput: ISmartInput, fn: () => Promise<void>): Promise<void> {
    smartInput.pause();
    try {
      await this.withEscHandler(fn);
    } finally {
      smartInput.resume();
    }
  }

  private async showConfig(): Promise<void> {
    await this.configManager.loadConfig();
    const config = this.configManager.getConfig();
    const providers = this.configManager.getConfiguredProviders();
    const providerLines = providers.length === 0
      ? [
        colorize('No providers configured.', 'muted'),
        `${colorize('Tip', 'muted')} use ${colorize('cast config init', 'cyan')} or ${colorize('/config add-provider', 'cyan')}`,
      ]
      : providers.flatMap((provider) => {
        const meta = PROVIDER_METADATA[provider];
        const isConfigured = this.configManager.isProviderConfigured(provider);
        const status = isConfigured ? colorize('✓', 'success') : colorize('✗', 'error');
        const providerConfig = this.configManager.getProviderConfig(provider) as { baseUrl?: string } | undefined;
        return [
          `${status} ${colorize(meta.name, 'cyan')} ${colorize(`(${provider})`, 'muted')} ${colorize(getProviderEndpointLabel(provider), 'subtle')}`,
          ...(providerConfig?.baseUrl ? [`  ${colorize('url:', 'muted')} ${colorize(providerConfig.baseUrl, 'subtle')}`] : []),
        ];
      });

    const modelLines: string[] = [];
    for (const purpose of MODEL_PURPOSES) {
      const modelConfig = config.models[purpose.value];
      if (modelConfig) {
        const providerName = PROVIDER_METADATA[modelConfig.provider].name;
        const endpointLabel = getProviderEndpointLabel(modelConfig.provider);
        const isRecommended = isRecommendedModelForPurpose(
          modelConfig.provider,
          purpose.value,
          modelConfig.model,
        );
        modelLines.push(
          `${colorize(purpose.label.padEnd(12), 'cyan')} ${modelConfig.model} ${colorize(`${providerName} · ${endpointLabel}`, 'subtle')} ${isRecommended ? colorize('recommended', 'success') : colorize('custom', 'warning')}`,
        );
      }
    }

    process.stdout.write(this.ui.panel({
      title: 'Current Configuration',
      sections: [
        { title: 'Providers', lines: providerLines },
        { title: 'Models', lines: modelLines.length ? modelLines : [colorize('No models configured.', 'muted')] },
        {
          title: 'Remote UI',
          rows: [
            { label: 'Status', value: config.remote?.enabled ? colorize('active', 'success') : colorize('disabled', 'muted') },
            { label: 'Whisper', value: config.remote?.openaiApiKey ? colorize('configured', 'success') : colorize('not configured', 'muted') },
          ],
        },
      ],
      footer: `File: ${this.configManager.getConfigPath()}`,
    }));
  }

  private async addProviderInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const availableProviders = Object.keys(PROVIDER_METADATA).filter(
      (p) => !this.configManager.isProviderConfigured(p as ProviderType)
    ) as ProviderType[];

    if (availableProviders.length === 0) {
      this.warning('All providers are already configured.');
      return;
    }

    this.header('Add Provider', 'Press ESC to cancel.');

    const provider = await selectWithEsc<ProviderType>({
      message: 'Which provider would you like to add?',
      choices: availableProviders.map((p) => ({
        name: `${PROVIDER_METADATA[p].name} - ${PROVIDER_METADATA[p].description}`,
        value: p,
      })),
    });

    if (provider === null) {
      this.warning('Cancelled.');
      return;
    }

    const meta = PROVIDER_METADATA[provider];
    if (meta.setupHints?.length) {
      for (const hint of meta.setupHints) {
        process.stdout.write(`  ${colorize(`→ ${hint}`, 'muted')}\r\n`);
      }
    }
    if (meta.exampleBaseUrls?.length) {
      process.stdout.write(`  ${colorize(`→ Example URLs: ${meta.exampleBaseUrls.join('  |  ')}`, 'muted')}\r\n`);
    }

    let config: { apiKey?: string; baseUrl?: string } = {};

    if (providerRequiresBaseUrl(provider)) {
      const baseUrl = await inputWithEsc({
        message: provider === 'ollama' ? 'Ollama server URL:' : 'OpenAI-compatible base URL:',
        default: meta.defaultBaseUrl,
      });
      if (baseUrl === null) {
        this.warning('Cancelled.');
        return;
      }

      if (providerAllowsOptionalApiKey(provider)) {
        const apiKeyRaw = await inputWithEsc({
          message: `API Key for ${meta.name} (optional):`,
        });
        if (apiKeyRaw === null) {
          this.warning('Cancelled.');
          return;
        }
        const apiKey = apiKeyRaw.trim();
        config = {
          baseUrl: baseUrl.trim(),
          ...(apiKey ? { apiKey } : {}),
        };
      } else {
        config = { baseUrl: baseUrl.trim() };
      }
    } else {
      process.stdout.write(`  ${colorize(`→ Get your API key at: ${meta.websiteUrl}`, 'muted')}\r\n`);

      const apiKeyRaw = await inputWithEsc({
        message: `API Key for ${meta.name}:`,
        validate: (v) => {
          const clean = v.trim();
          if (clean.length <= 5) return 'API key is too short';
          if (/[\s%]/.test(clean)) return 'API key contains invalid characters (spaces or %)';
          return true;
        },
      });

      if (apiKeyRaw === null) {
        this.warning('Cancelled.');
        return;
      }
      const apiKey = apiKeyRaw.trim();

      const useCustom = await confirmWithEsc({
        message: 'Use a custom URL?',
        default: false,
      });

      if (useCustom === null) {
        this.warning('Cancelled.');
        return;
      }

      let baseUrl: string | undefined;
      if (useCustom) {
        baseUrl = await inputWithEsc({
          message: 'API URL:',
          default: meta.defaultBaseUrl,
        });
        if (baseUrl === null) {
          this.warning('Cancelled.');
          return;
        }
      }

      config = { apiKey, ...(baseUrl ? { baseUrl: baseUrl.trim() } : {}) };
    }

    await this.configManager.addProvider(provider, config);
    this.success(`Provider ${meta.name} added successfully.`);
  }

  private async removeProviderInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const configuredProviders = this.configManager.getConfiguredProviders();
    if (configuredProviders.length === 0) {
      this.warning('No providers configured to remove.');
      return;
    }

    this.header('Remove Provider', 'Press ESC to cancel.');

    const provider = await selectWithEsc<ProviderType>({
      message: 'Which provider would you like to remove?',
      choices: configuredProviders.map((p) => ({
        name: PROVIDER_METADATA[p].name,
        value: p,
      })),
    });

    if (provider === null) {
      this.warning('Cancelled.');
      return;
    }

    const confirmRemove = await confirmWithEsc({
      message: `Are you sure you want to remove ${PROVIDER_METADATA[provider].name}?`,
      default: false,
    });

    if (confirmRemove === null || !confirmRemove) {
      this.warning('Cancelled.');
      return;
    }

    const config = this.configManager.getConfig();
    delete config.providers[provider];
    await this.configManager.saveConfig(config);
    this.success('Provider removed.');
  }

  private async setModelInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const availableProviders = this.configManager.getConfiguredProviders();
    if (availableProviders.length === 0) {
      this.error('No providers configured. Configure a provider first.');
      return;
    }

    this.header('Configure Model', 'Press ESC to cancel.');

    const purpose = await selectWithEsc<ModelPurpose>({
      message: 'For which purpose?',
      choices: MODEL_PURPOSES.map((p) => ({
        name: `${p.label} - ${p.description}`,
        value: p.value,
      })),
    });

    if (purpose === null) {
      this.warning('Cancelled.');
      return;
    }

    const provider = await selectWithEsc<ProviderType>({
      message: 'Which provider?',
      choices: availableProviders.map((p) => ({
        name: `${PROVIDER_METADATA[p].name}${
          getRecommendedModel(p, purpose)
            ? ` - rec ${getRecommendedModel(p, purpose)}`
            : ''
        }`,
        value: p,
      })),
    });

    if (provider === null) {
      this.warning('Cancelled.');
      return;
    }

    const meta = PROVIDER_METADATA[provider];
    const recommendedModel = getRecommendedModel(provider, purpose);

    const usePopular = await confirmWithEsc({
      message: `Use one of ${meta.name}'s popular models?`,
      default: true,
    });

    if (usePopular === null) {
      this.warning('Cancelled.');
      return;
    }

    let model: string | null;

    if (usePopular) {
      if (recommendedModel) {
        process.stdout.write(`  ${colorize(`→ Recommended for ${purpose}: ${recommendedModel}`, 'muted')}\r\n`);
      }

      model = await selectWithEsc<string>({
        message: 'Choose the model:',
        choices: [
          ...getModelChoicesForPurpose(provider, purpose).map((choice) => ({
            name: choice.label,
            value: choice.value,
          })),
          { name: 'Other model...', value: '__custom__' },
        ],
        default: recommendedModel,
      });

      if (model === null) {
        this.warning('Cancelled.');
        return;
      }

      if (model === '__custom__') {
        model = await inputWithEsc({
          message: 'Model name:',
          default: recommendedModel || meta.popularModels[0],
        });
        if (model === null) {
          this.warning('Cancelled.');
          return;
        }
      }
    } else {
      model = await inputWithEsc({
        message: 'Model name:',
        default: recommendedModel || meta.popularModels[0],
      });
      if (model === null) {
        this.warning('Cancelled.');
        return;
      }
    }

    await this.configManager.setModel(purpose, {
      provider,
      model,
    });

    const purposeLabel = MODEL_PURPOSES.find((p) => p.value === purpose)?.label;
    this.success(`Model for "${purposeLabel}" configured: ${model}`);
  }

  private async setApiKeyInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const configuredProviders = this.configManager
      .getConfiguredProviders()
      .filter((p) => providerSupportsApiKey(p));

    if (configuredProviders.length === 0) {
      this.warning('No providers with configurable API keys found.');
      return;
    }

    this.header('Change API Key', 'Press ESC to cancel.');

    const provider = await selectWithEsc<ProviderType>({
      message: 'Which provider would you like to update?',
      choices: configuredProviders.map((p) => ({
        name: PROVIDER_METADATA[p].name,
        value: p,
      })),
    });

    if (provider === null) {
      this.warning('Cancelled.');
      return;
    }

    const currentConfig = this.configManager.getProviderConfig(provider) as { baseUrl?: string } | undefined;
    const isOptionalApiKeyProvider = providerAllowsOptionalApiKey(provider);
    const apiKeyRaw = await inputWithEsc({
      message: `New API key for ${PROVIDER_METADATA[provider].name}${isOptionalApiKeyProvider ? ' (leave blank to remove)' : ''}:`,
      validate: (v) => {
        const clean = v.trim();
        if (isOptionalApiKeyProvider && clean.length === 0) return true;
        if (clean.length <= 5) return 'API key is too short';
        if (/[\s%]/.test(clean)) return 'API key contains invalid characters (spaces or %)';
        return true;
      },
    });

    if (apiKeyRaw === null) {
      this.warning('Cancelled.');
      return;
    }

    let baseUrl = currentConfig?.baseUrl;
    const changeBaseUrl = await confirmWithEsc({
      message: 'Would you also like to change the base URL?',
      default: false,
    });

    if (changeBaseUrl === null) {
      this.warning('Cancelled.');
      return;
    }

    if (changeBaseUrl) {
      const newBaseUrl = await inputWithEsc({
        message: 'New base URL:',
        default: baseUrl || PROVIDER_METADATA[provider].defaultBaseUrl,
      });
      if (newBaseUrl === null) {
        this.warning('Cancelled.');
        return;
      }
      baseUrl = newBaseUrl;
    }

    await this.configManager.addProvider(provider, {
      apiKey: apiKeyRaw.trim() || undefined,
      baseUrl,
    });

    this.success(`API key for ${PROVIDER_METADATA[provider].name} updated.`);
  }

  private async setRemoteInteractive(): Promise<void> {
    await this.configManager.loadConfig();
    const config = this.configManager.getConfig();

    this.header('Remote Access', 'Press ESC to cancel.');

    const enableRemote = await confirmWithEsc({
      message: 'Enable remote access (Web UI) via ngrok?',
      default: config.remote?.enabled ?? false,
    });

    if (enableRemote === null) {
      this.warning('Cancelled.');
      return;
    }

    if (!enableRemote) {
      config.remote = { enabled: false };
      await this.configManager.saveConfig(config);
      this.success('Remote Access disabled.');
      return;
    }

    const passwordRaw = await inputWithEsc({
      message: 'Set a password to access the Web UI:',
      default: config.remote?.password || '',
      validate: (v) => v.trim().length > 0 ? true : 'Password cannot be empty',
    });

    if (passwordRaw === null) {
      this.warning('Cancelled.');
      return;
    }
    const password = passwordRaw.trim();

    let openaiApiKey = config.remote?.openaiApiKey;
    if (!openaiApiKey && config.providers.openai?.apiKey) {
      const useExistingOpenAI = await confirmWithEsc({
        message: 'Use your current OpenAI API Key for Whisper audio transcription?',
        default: true,
      });
      if (useExistingOpenAI === null) return;
      if (useExistingOpenAI) {
        openaiApiKey = config.providers.openai.apiKey;
      }
    }

    if (!openaiApiKey) {
      const requestKey = await confirmWithEsc({
        message: 'Configure a specific OpenAI API Key for audio transcription?',
        default: false,
      });

      if (requestKey === null) return;
      if (requestKey) {
        const keyRaw = await inputWithEsc({
          message: 'OpenAI API Key for Whisper:',
          validate: (v) => v.trim().length > 10 ? true : 'Enter a valid key',
        });
        if (keyRaw === null) return;
        openaiApiKey = keyRaw.trim();
      }
    }

    let ngrokAuthToken = config.remote?.ngrokAuthToken;
    const requestNgrokToken = await inputWithEsc({
      message: '(Optional) Ngrok Authtoken (required for online tunnel):\nLeave blank if you already configured ngrok globally:',
      default: ngrokAuthToken || '',
    });
    if (requestNgrokToken === null) return;

    if (requestNgrokToken.trim().length > 0) {
      ngrokAuthToken = requestNgrokToken.trim();
    } else {
      ngrokAuthToken = undefined;
    }

    config.remote = {
      enabled: true,
      password,
      openaiApiKey,
      ngrokAuthToken,
    };

    await this.configManager.saveConfig(config);
    this.success('Remote Access configured successfully.');
  }

  private async editTemplateInteractive(smartInput?: ISmartInput): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { execSync } = require('child_process');

    const userDir = path.join(os.homedir(), '.cast', 'prompts');

    if (!fs.existsSync(userDir)) {
      this.warning('No prompt templates found. Start a chat session first to seed the templates.');
      return;
    }

    const files = fs.readdirSync(userDir).filter((f: string) => f.endsWith('.md'));
    if (files.length === 0) {
      this.warning(`No templates found in ${userDir}`);
      return;
    }

    const descriptions: Record<string, string> = {
      'base.md': 'Core system prompt (loaded on every message)',
      'git.md': 'Extra context for git / commit messages',
      'pr.md': 'Pull request descriptions',
      'release.md': 'Release notes',
      'planning.md': 'Planning and architecture mode',
      'mcp.md': 'MCP tools context',
      'mentions.md': 'File / URL mentions context',
    };

    const choices = files.map((f: string) => ({
      name: `${f.padEnd(14)} ${chalk.gray(descriptions[f] || '')}`,
      value: f,
    }));

    if (smartInput) {
      const selected = await smartInput.askChoice('Which template to edit?', choices.map((c: any) => ({ key: c.value, label: c.name, description: '' })));
      if (!selected) return;
      this.openFileInEditor(path.join(userDir, selected), execSync);
    } else {
      const selected = await selectWithEsc<string>({ message: 'Which template to edit?', choices });
      if (selected === null) return;
      this.openFileInEditor(path.join(userDir, selected), execSync);
    }
  }

  private openFileInEditor(filePath: string, execSync: any): void {
    const editor = process.env.EDITOR || process.env.VISUAL;
    try {
      execSync(`code "${filePath}"`, { stdio: 'ignore' });
      this.success(`Opened in VS Code: ${filePath}`);
      return;
    } catch {}
    if (editor) {
      try {
        execSync(`${editor} "${filePath}"`, { stdio: 'ignore' });
        this.success(`Opened in ${editor}: ${filePath}`);
        return;
      } catch {}
    }
    process.stdout.write(this.ui.panel({
      title: 'Edit Template',
      sections: [{ lines: [colorize(filePath, 'cyan')] }],
    }));
  }

  private async changeLanguageInteractive(): Promise<void> {
    this.header('Change Language', 'Press ESC to cancel.');

    const lang = await selectWithEsc<'en' | 'pt'>({
      message: 'Select language / Selecione o idioma:',
      choices: [
        { name: 'English', value: 'en' },
        { name: 'Português', value: 'pt' },
      ],
    });

    if (lang === null) {
      this.warning('Cancelled.');
      return;
    }

    const config = this.configManager.getConfig();
    (config as any).language = lang;
    await this.configManager.saveConfig(config);
    this.i18nService.setLanguage(lang);
    this.success(`Language set to ${lang === 'pt' ? 'Português' : 'English'}.`);
  }

  private header(title: string, footer?: string): void {
    process.stdout.write(this.ui.panel({
      title,
      sections: [{ lines: [colorize('Interactive configuration flow.', 'muted')] }],
      footer,
    }));
  }

  private success(message: string): void {
    process.stdout.write(this.ui.success(message));
  }

  private warning(message: string): void {
    process.stdout.write(this.ui.warning(message));
  }

  private error(message: string): void {
    process.stdout.write(this.ui.error(message));
  }
}
