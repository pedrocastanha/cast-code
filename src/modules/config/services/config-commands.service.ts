import { Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { ConfigManagerService } from './config-manager.service';
import { InitConfigService } from './init-config.service';
import {
  ProviderType,
  PROVIDER_METADATA,
  MODEL_PURPOSES,
  ModelPurpose,
} from '../types/config.types';
import {
  selectWithEsc,
  inputWithEsc,
  confirmWithEsc,
  CancelledPromptError,
  withEsc,
} from '../../repl/utils/prompts-with-esc';
import { ISmartInput } from '../../repl/services/smart-input';
import { I18nService } from '../../i18n/services/i18n.service';

@Injectable()
export class ConfigCommandsService {
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
          console.log(this.configManager.getConfigPath());
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
      console.log(chalk.yellow('\n\n❌ Cancelled. Returning to menu...\n'));
    }
  }

  private async showConfigMenu(smartInput: ISmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const Colors = {
      cyan: '\x1b[38;5;51m',
      green: '\x1b[38;5;82m',
      yellow: '\x1b[38;5;220m',
      gray: '\x1b[38;5;245m',
      bold: '\x1b[1m',
      reset: '\x1b[0m',
    };

    await this.configManager.loadConfig();

    while (true) {
      w(`\n${Colors.cyan}${Colors.bold}⚙️  Cast Code Configuration${Colors.reset}\n`);
      w(`${Colors.gray}${'─'.repeat(30)}${Colors.reset}\n\n`);

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
        console.log(chalk.yellow('\nExiting configuration menu...\n'));
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
          console.log(`\n📁 ${this.configManager.getConfigPath()}\n`);
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

    const w = (s: string) => process.stdout.write(s);
    const Colors = {
      cyan: '\x1b[38;5;51m',
      green: '\x1b[38;5;82m',
      red: '\x1b[38;5;196m',
      yellow: '\x1b[38;5;220m',
      gray: '\x1b[38;5;245m',
      bold: '\x1b[1m',
      reset: '\x1b[0m',
    };

    w(`\n${Colors.cyan}${Colors.bold}⚙️  Current Configuration${Colors.reset}\n`);
    w(`${Colors.gray}${'─'.repeat(40)}${Colors.reset}\n\n`);

    w(`${Colors.yellow}📦 Configured providers:${Colors.reset}\n`);
    const providers = this.configManager.getConfiguredProviders();
    if (providers.length === 0) {
      w(`${Colors.gray}   No providers configured${Colors.reset}\n`);
      w(`${Colors.gray}   Use "cast config init" or /config add-provider${Colors.reset}\n`);
    } else {
      for (const provider of providers) {
        const meta = PROVIDER_METADATA[provider];
        const isConfigured = this.configManager.isProviderConfigured(provider);
        const status = isConfigured
          ? `${Colors.green}✓`
          : `${Colors.red}✗`;
        w(`   ${status} ${meta.name} ${Colors.gray}(${provider})${Colors.reset}\n`);
      }
    }

    w(`\n${Colors.yellow}🤖 Configured models:${Colors.reset}\n`);
    for (const purpose of MODEL_PURPOSES) {
      const modelConfig = config.models[purpose.value];
      if (modelConfig) {
        const providerName = PROVIDER_METADATA[modelConfig.provider].name;
        w(`   ${Colors.cyan}${purpose.label.padEnd(12)}${Colors.reset} → ${modelConfig.model}\n`);
        w(`   ${Colors.gray}${' '.repeat(12)}   ${providerName}${Colors.reset}\n`);
      }
    }

    w(`\n${Colors.yellow}🌐 Remote Access (Web UI):${Colors.reset}\n`);
    if (config.remote?.enabled) {
      w(`   Status:   ${Colors.green}Active${Colors.reset}\n`);
      w(`   Whisper:  ${config.remote.openaiApiKey ? Colors.green + 'Configured' + Colors.reset : Colors.gray + 'Not configured' + Colors.reset}\n`);
    } else {
      w(`   Status:   ${Colors.gray}Disabled${Colors.reset}\n`);
    }

    w(`\n${Colors.gray}📁 Arquivo: ${this.configManager.getConfigPath()}${Colors.reset}\n\n`);
  }

  private async addProviderInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const availableProviders = Object.keys(PROVIDER_METADATA).filter(
      (p) => !this.configManager.isProviderConfigured(p as ProviderType)
    ) as ProviderType[];

    if (availableProviders.length === 0) {
      console.log(chalk.yellow('\n⚠️  All providers are already configured!\n'));
      return;
    }

    console.log(chalk.cyan('\n📦 Add Provider'));
    console.log(chalk.gray('(press ESC to cancel)\n'));

    const provider = await selectWithEsc<ProviderType>({
      message: 'Which provider would you like to add?',
      choices: availableProviders.map((p) => ({
        name: `${PROVIDER_METADATA[p].name} - ${PROVIDER_METADATA[p].description}`,
        value: p,
      })),
    });

    if (provider === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    const meta = PROVIDER_METADATA[provider];

    let config: { apiKey?: string; baseUrl?: string } = {};

    if (provider === 'ollama') {
      const baseUrl = await inputWithEsc({
        message: 'Ollama server URL:',
        default: meta.defaultBaseUrl,
      });
      if (baseUrl === null) {
        console.log(chalk.yellow('\n❌ Cancelled.\n'));
        return;
      }
      config = { baseUrl };
    } else {
      console.log(chalk.gray(`→ Get your API key at: ${meta.websiteUrl}`));

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
        console.log(chalk.yellow('\n❌ Cancelled.\n'));
        return;
      }
      const apiKey = apiKeyRaw.trim();

      const useCustom = await confirmWithEsc({
        message: 'Use a custom URL?',
        default: false,
      });

      if (useCustom === null) {
        console.log(chalk.yellow('\n❌ Cancelled.\n'));
        return;
      }

      let baseUrl: string | undefined;
      if (useCustom) {
        baseUrl = await inputWithEsc({
          message: 'API URL:',
          default: meta.defaultBaseUrl,
        });
        if (baseUrl === null) {
          console.log(chalk.yellow('\n❌ Cancelled.\n'));
          return;
        }
      }

      config = { apiKey, baseUrl };
    }

    await this.configManager.addProvider(provider, config);
    console.log(chalk.green(`\n✓ Provider ${meta.name} added successfully!\n`));
  }

  private async removeProviderInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const configuredProviders = this.configManager.getConfiguredProviders();
    if (configuredProviders.length === 0) {
      console.log(chalk.yellow('\n⚠️  No providers configured to remove.\n'));
      return;
    }

    console.log(chalk.gray('(press ESC to cancel)\n'));

    const provider = await selectWithEsc<ProviderType>({
      message: 'Which provider would you like to remove?',
      choices: configuredProviders.map((p) => ({
        name: PROVIDER_METADATA[p].name,
        value: p,
      })),
    });

    if (provider === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    const confirmRemove = await confirmWithEsc({
      message: `Are you sure you want to remove ${PROVIDER_METADATA[provider].name}?`,
      default: false,
    });

    if (confirmRemove === null || !confirmRemove) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    const config = this.configManager.getConfig();
    delete config.providers[provider];
    await this.configManager.saveConfig(config);
    console.log(chalk.green(`\n✓ Provider removed.\n`));
  }

  private async setModelInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const availableProviders = this.configManager.getConfiguredProviders();
    if (availableProviders.length === 0) {
      console.log(
        chalk.red('\n❌ No providers configured. Configure a provider first.\n')
      );
      return;
    }

    console.log(chalk.cyan('\n🤖 Configure Model'));
    console.log(chalk.gray('(press ESC to cancel)\n'));

    const purpose = await selectWithEsc<ModelPurpose>({
      message: 'For which purpose?',
      choices: MODEL_PURPOSES.map((p) => ({
        name: `${p.label} - ${p.description}`,
        value: p.value,
      })),
    });

    if (purpose === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    const provider = await selectWithEsc<ProviderType>({
      message: 'Which provider?',
      choices: availableProviders.map((p) => ({
        name: PROVIDER_METADATA[p].name,
        value: p,
      })),
    });

    if (provider === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    const meta = PROVIDER_METADATA[provider];

    const usePopular = await confirmWithEsc({
      message: `Use one of ${meta.name}'s popular models?`,
      default: true,
    });

    if (usePopular === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    let model: string | null;

    if (usePopular) {
      model = await selectWithEsc<string>({
        message: 'Choose the model:',
        choices: [
          ...meta.popularModels.map((m) => ({ name: m, value: m })),
          { name: '➕ Outro modelo...', value: '__custom__' },
        ],
      });

      if (model === null) {
        console.log(chalk.yellow('\n❌ Cancelled.\n'));
        return;
      }

      if (model === '__custom__') {
        model = await inputWithEsc({
          message: 'Model name:',
          default: meta.popularModels[0],
        });
        if (model === null) {
          console.log(chalk.yellow('\n❌ Cancelled.\n'));
          return;
        }
      }
    } else {
      model = await inputWithEsc({
        message: 'Model name:',
        default: meta.popularModels[0],
      });
      if (model === null) {
        console.log(chalk.yellow('\n❌ Cancelled.\n'));
        return;
      }
    }

    await this.configManager.setModel(purpose, {
      provider,
      model,
    });

    const purposeLabel = MODEL_PURPOSES.find((p) => p.value === purpose)?.label;
    console.log(
      chalk.green(`\n✓ Model for "${purposeLabel}" configured: ${model}\n`)
    );
  }

  private async setApiKeyInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const configuredProviders = this.configManager
      .getConfiguredProviders()
      .filter((p) => p !== 'ollama');

    if (configuredProviders.length === 0) {
      console.log(chalk.yellow('\n⚠️  No providers with configurable API keys found.\n'));
      return;
    }

    console.log(chalk.cyan('\n🔑 Change API Key'));
    console.log(chalk.gray('(press ESC to cancel)\n'));

    const provider = await selectWithEsc<ProviderType>({
      message: 'Which provider would you like to update?',
      choices: configuredProviders.map((p) => ({
        name: PROVIDER_METADATA[p].name,
        value: p,
      })),
    });

    if (provider === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    const currentConfig = this.configManager.getProviderConfig(provider) as { baseUrl?: string } | undefined;
    const apiKeyRaw = await inputWithEsc({
      message: `New API key for ${PROVIDER_METADATA[provider].name}:`,
      validate: (v) => {
        const clean = v.trim();
        if (clean.length <= 5) return 'API key is too short';
        if (/[\s%]/.test(clean)) return 'API key contains invalid characters (spaces or %)';
        return true;
      },
    });

    if (apiKeyRaw === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    let baseUrl = currentConfig?.baseUrl;
    const changeBaseUrl = await confirmWithEsc({
      message: 'Would you also like to change the base URL?',
      default: false,
    });

    if (changeBaseUrl === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    if (changeBaseUrl) {
      const newBaseUrl = await inputWithEsc({
        message: 'New base URL:',
        default: baseUrl || PROVIDER_METADATA[provider].defaultBaseUrl,
      });
      if (newBaseUrl === null) {
        console.log(chalk.yellow('\n❌ Cancelled.\n'));
        return;
      }
      baseUrl = newBaseUrl;
    }

    await this.configManager.addProvider(provider, {
      apiKey: apiKeyRaw.trim(),
      baseUrl,
    });

    console.log(chalk.green(`\n✓ API key for ${PROVIDER_METADATA[provider].name} updated.\n`));
  }

  private async setRemoteInteractive(): Promise<void> {
    await this.configManager.loadConfig();
    const config = this.configManager.getConfig();

    console.log(chalk.cyan('\n🌐 Remote Access Configuration (Web UI)'));
    console.log(chalk.gray('(press ESC to cancel)\n'));

    const enableRemote = await confirmWithEsc({
      message: 'Enable remote access (Web UI) via ngrok?',
      default: config.remote?.enabled ?? false,
    });

    if (enableRemote === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    if (!enableRemote) {
      config.remote = { enabled: false };
      await this.configManager.saveConfig(config);
      console.log(chalk.green(`\n✓ Remote Access disabled.\n`));
      return;
    }

    const passwordRaw = await inputWithEsc({
      message: 'Set a password to access the Web UI:',
      default: config.remote?.password || '',
      validate: (v) => v.trim().length > 0 ? true : 'Password cannot be empty',
    });

    if (passwordRaw === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
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
    console.log(chalk.green(`\n✓ Remote Access configured successfully!\n`));
  }

  private async editTemplateInteractive(smartInput?: ISmartInput): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { execSync } = require('child_process');

    const userDir = path.join(os.homedir(), '.cast', 'prompts');

    if (!fs.existsSync(userDir)) {
      console.log(chalk.yellow('\n⚠️  No prompt templates found. Start a chat session first to seed the templates.\n'));
      return;
    }

    const files = fs.readdirSync(userDir).filter((f: string) => f.endsWith('.md'));
    if (files.length === 0) {
      console.log(chalk.yellow('\n⚠️  No templates found in ' + userDir + '\n'));
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
      console.log(chalk.green(`\n✓ Opened in VS Code: ${filePath}\n`));
      return;
    } catch {}
    if (editor) {
      try {
        execSync(`${editor} "${filePath}"`, { stdio: 'ignore' });
        console.log(chalk.green(`\n✓ Opened in ${editor}: ${filePath}\n`));
        return;
      } catch {}
    }
    console.log(chalk.cyan(`\nEdit this file: ${filePath}\n`));
  }

  private async changeLanguageInteractive(): Promise<void> {
    console.log(chalk.cyan('\n🌐 Change Language'));
    console.log(chalk.gray('(press ESC to cancel)\n'));

    const lang = await selectWithEsc<'en' | 'pt'>({
      message: 'Select language / Selecione o idioma:',
      choices: [
        { name: 'English', value: 'en' },
        { name: 'Português', value: 'pt' },
      ],
    });

    if (lang === null) {
      console.log(chalk.yellow('\n❌ Cancelled.\n'));
      return;
    }

    const config = this.configManager.getConfig();
    (config as any).language = lang;
    await this.configManager.saveConfig(config);
    this.i18nService.setLanguage(lang);
    console.log(chalk.green(`\n✓ Language set to ${lang === 'pt' ? 'Português' : 'English'}.\n`));
  }
}
