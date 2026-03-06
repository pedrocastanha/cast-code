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

interface SmartInput {
  askChoice: (question: string, choices: { key: string; label: string; description: string }[]) => Promise<string>;
  question: (prompt: string) => Promise<string>;
  pause: () => void;
  resume: () => void;
}

@Injectable()
export class ConfigCommandsService {
  constructor(
    private readonly configManager: ConfigManagerService,
    private readonly initService: InitConfigService
  ) { }

  async handleConfigCommand(args: string[], smartInput?: SmartInput): Promise<void> {
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
      console.log(chalk.yellow('\n\n❌ Cancelado. Voltando ao menu...\n'));
    }
  }

  private async showConfigMenu(smartInput: SmartInput): Promise<void> {
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
      w(`\n${Colors.cyan}${Colors.bold}⚙️  Configuração Cast Code${Colors.reset}\n`);
      w(`${Colors.gray}${'─'.repeat(30)}${Colors.reset}\n\n`);

      const action = await withEsc(() => smartInput.askChoice('O que deseja fazer?', [
        { key: '1', label: 'Ver configuração atual', description: 'Mostrar provedores e modelos' },
        { key: '2', label: 'Configuração inicial completa', description: 'Wizard de setup' },
        { key: '3', label: 'Adicionar provedor', description: 'Novo serviço de IA' },
        { key: '4', label: 'Remover provedor', description: 'Remover serviço' },
        { key: '5', label: 'Configurar modelo', description: 'Definir modelo para finalidade' },
        { key: '6', label: 'Alterar API key', description: 'Atualizar credencial de um provedor' },
        { key: '7', label: 'Configurar Remote UI', description: 'Habilitar/Desabilitar ou alterar senha' },
        { key: '8', label: 'Ver caminho do arquivo', description: 'Local do config.yaml' },
        { key: '9', label: 'Sair', description: 'Voltar ao chat' },
      ]));

      if (action === null) {
        console.log(chalk.yellow('\nSaindo do menu de configuração...\n'));
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
        case '9':
          return;
      }
    }
  }

  private async runInquirerFlow(smartInput: SmartInput, fn: () => Promise<void>): Promise<void> {
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

    w(`\n${Colors.cyan}${Colors.bold}⚙️  Configuração Atual${Colors.reset}\n`);
    w(`${Colors.gray}${'─'.repeat(40)}${Colors.reset}\n\n`);

    w(`${Colors.yellow}📦 Provedores configurados:${Colors.reset}\n`);
    const providers = this.configManager.getConfiguredProviders();
    if (providers.length === 0) {
      w(`${Colors.gray}   Nenhum provedor configurado${Colors.reset}\n`);
      w(`${Colors.gray}   Use "cast config init" ou /config add-provider${Colors.reset}\n`);
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

    w(`\n${Colors.yellow}🤖 Modelos configurados:${Colors.reset}\n`);
    for (const purpose of MODEL_PURPOSES) {
      const modelConfig = config.models[purpose.value];
      if (modelConfig) {
        const providerName = PROVIDER_METADATA[modelConfig.provider].name;
        w(`   ${Colors.cyan}${purpose.label.padEnd(12)}${Colors.reset} → ${modelConfig.model}\n`);
        w(`   ${Colors.gray}${' '.repeat(12)}   ${providerName}${Colors.reset}\n`);
      }
    }

    w(`\n${Colors.yellow}🌐 Acesso Remoto (Web UI):${Colors.reset}\n`);
    if (config.remote?.enabled) {
      w(`   Status:   ${Colors.green}Ativo${Colors.reset}\n`);
      w(`   Whisper:  ${config.remote.openaiApiKey ? Colors.green + 'Configurado' + Colors.reset : Colors.gray + 'Não configurado' + Colors.reset}\n`);
    } else {
      w(`   Status:   ${Colors.gray}Desabilitado${Colors.reset}\n`);
    }

    w(`\n${Colors.gray}📁 Arquivo: ${this.configManager.getConfigPath()}${Colors.reset}\n\n`);
  }

  private async addProviderInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const availableProviders = Object.keys(PROVIDER_METADATA).filter(
      (p) => !this.configManager.isProviderConfigured(p as ProviderType)
    ) as ProviderType[];

    if (availableProviders.length === 0) {
      console.log(chalk.yellow('\n⚠️  Todos os provedores já estão configurados!\n'));
      return;
    }

    console.log(chalk.cyan('\n📦 Adicionar Provedor'));
    console.log(chalk.gray('(pressione ESC para cancelar)\n'));

    const provider = await selectWithEsc<ProviderType>({
      message: 'Qual provedor deseja adicionar?',
      choices: availableProviders.map((p) => ({
        name: `${PROVIDER_METADATA[p].name} - ${PROVIDER_METADATA[p].description}`,
        value: p,
      })),
    });

    if (provider === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    const meta = PROVIDER_METADATA[provider];

    let config: { apiKey?: string; baseUrl?: string } = {};

    if (provider === 'ollama') {
      const baseUrl = await inputWithEsc({
        message: 'URL do servidor Ollama:',
        default: meta.defaultBaseUrl,
      });
      if (baseUrl === null) {
        console.log(chalk.yellow('\n❌ Cancelado.\n'));
        return;
      }
      config = { baseUrl };
    } else {
      console.log(chalk.gray(`→ Obtenha sua API key em: ${meta.websiteUrl}`));

      const apiKeyRaw = await inputWithEsc({
        message: `API Key para ${meta.name}:`,
        validate: (v) => {
          const clean = v.trim();
          if (clean.length <= 5) return 'API key muito curta';
          if (/[\s%]/.test(clean)) return 'API key contém caracteres inválidos (espaços ou %)';
          return true;
        },
      });

      if (apiKeyRaw === null) {
        console.log(chalk.yellow('\n❌ Cancelado.\n'));
        return;
      }
      const apiKey = apiKeyRaw.trim();

      const useCustom = await confirmWithEsc({
        message: 'Usar URL customizada?',
        default: false,
      });

      if (useCustom === null) {
        console.log(chalk.yellow('\n❌ Cancelado.\n'));
        return;
      }

      let baseUrl: string | undefined;
      if (useCustom) {
        baseUrl = await inputWithEsc({
          message: 'URL da API:',
          default: meta.defaultBaseUrl,
        });
        if (baseUrl === null) {
          console.log(chalk.yellow('\n❌ Cancelado.\n'));
          return;
        }
      }

      config = { apiKey, baseUrl };
    }

    await this.configManager.addProvider(provider, config);
    console.log(chalk.green(`\n✓ Provedor ${meta.name} adicionado com sucesso!\n`));
  }

  private async removeProviderInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const configuredProviders = this.configManager.getConfiguredProviders();
    if (configuredProviders.length === 0) {
      console.log(chalk.yellow('\n⚠️  Nenhum provedor configurado para remover.\n'));
      return;
    }

    console.log(chalk.gray('(pressione ESC para cancelar)\n'));

    const provider = await selectWithEsc<ProviderType>({
      message: 'Qual provedor deseja remover?',
      choices: configuredProviders.map((p) => ({
        name: PROVIDER_METADATA[p].name,
        value: p,
      })),
    });

    if (provider === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    const confirmRemove = await confirmWithEsc({
      message: `Tem certeza que deseja remover ${PROVIDER_METADATA[provider].name}?`,
      default: false,
    });

    if (confirmRemove === null || !confirmRemove) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    const config = this.configManager.getConfig();
    delete config.providers[provider];
    await this.configManager.saveConfig(config);
    console.log(chalk.green(`\n✓ Provedor removido.\n`));
  }

  private async setModelInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const availableProviders = this.configManager.getConfiguredProviders();
    if (availableProviders.length === 0) {
      console.log(
        chalk.red('\n❌ Nenhum provedor configurado. Configure um provedor primeiro.\n')
      );
      return;
    }

    console.log(chalk.cyan('\n🤖 Configurar Modelo'));
    console.log(chalk.gray('(pressione ESC para cancelar)\n'));

    const purpose = await selectWithEsc<ModelPurpose>({
      message: 'Para qual finalidade?',
      choices: MODEL_PURPOSES.map((p) => ({
        name: `${p.label} - ${p.description}`,
        value: p.value,
      })),
    });

    if (purpose === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    const provider = await selectWithEsc<ProviderType>({
      message: 'Qual provedor?',
      choices: availableProviders.map((p) => ({
        name: PROVIDER_METADATA[p].name,
        value: p,
      })),
    });

    if (provider === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    const meta = PROVIDER_METADATA[provider];

    const usePopular = await confirmWithEsc({
      message: `Usar um dos modelos populares do ${meta.name}?`,
      default: true,
    });

    if (usePopular === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    let model: string | null;

    if (usePopular) {
      model = await selectWithEsc<string>({
        message: 'Escolha o modelo:',
        choices: [
          ...meta.popularModels.map((m) => ({ name: m, value: m })),
          { name: '➕ Outro modelo...', value: '__custom__' },
        ],
      });

      if (model === null) {
        console.log(chalk.yellow('\n❌ Cancelado.\n'));
        return;
      }

      if (model === '__custom__') {
        model = await inputWithEsc({
          message: 'Nome do modelo:',
          default: meta.popularModels[0],
        });
        if (model === null) {
          console.log(chalk.yellow('\n❌ Cancelado.\n'));
          return;
        }
      }
    } else {
      model = await inputWithEsc({
        message: 'Nome do modelo:',
        default: meta.popularModels[0],
      });
      if (model === null) {
        console.log(chalk.yellow('\n❌ Cancelado.\n'));
        return;
      }
    }

    await this.configManager.setModel(purpose, {
      provider,
      model,
    });

    const purposeLabel = MODEL_PURPOSES.find((p) => p.value === purpose)?.label;
    console.log(
      chalk.green(`\n✓ Modelo para "${purposeLabel}" configurado: ${model}\n`)
    );
  }

  private async setApiKeyInteractive(): Promise<void> {
    await this.configManager.loadConfig();

    const configuredProviders = this.configManager
      .getConfiguredProviders()
      .filter((p) => p !== 'ollama');

    if (configuredProviders.length === 0) {
      console.log(chalk.yellow('\n⚠️  Nenhum provedor com API key configurável encontrado.\n'));
      return;
    }

    console.log(chalk.cyan('\n🔑 Alterar API Key'));
    console.log(chalk.gray('(pressione ESC para cancelar)\n'));

    const provider = await selectWithEsc<ProviderType>({
      message: 'Qual provedor deseja atualizar?',
      choices: configuredProviders.map((p) => ({
        name: PROVIDER_METADATA[p].name,
        value: p,
      })),
    });

    if (provider === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    const currentConfig = this.configManager.getProviderConfig(provider) as { baseUrl?: string } | undefined;
    const apiKeyRaw = await inputWithEsc({
      message: `Nova API key para ${PROVIDER_METADATA[provider].name}:`,
      validate: (v) => {
        const clean = v.trim();
        if (clean.length <= 5) return 'API key muito curta';
        if (/[\s%]/.test(clean)) return 'API key contém caracteres inválidos (espaços ou %)';
        return true;
      },
    });

    if (apiKeyRaw === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    let baseUrl = currentConfig?.baseUrl;
    const changeBaseUrl = await confirmWithEsc({
      message: 'Deseja alterar a base URL também?',
      default: false,
    });

    if (changeBaseUrl === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    if (changeBaseUrl) {
      const newBaseUrl = await inputWithEsc({
        message: 'Nova base URL:',
        default: baseUrl || PROVIDER_METADATA[provider].defaultBaseUrl,
      });
      if (newBaseUrl === null) {
        console.log(chalk.yellow('\n❌ Cancelado.\n'));
        return;
      }
      baseUrl = newBaseUrl;
    }

    await this.configManager.addProvider(provider, {
      apiKey: apiKeyRaw.trim(),
      baseUrl,
    });

    console.log(chalk.green(`\n✓ API key de ${PROVIDER_METADATA[provider].name} atualizada.\n`));
  }

  private async setRemoteInteractive(): Promise<void> {
    await this.configManager.loadConfig();
    const config = this.configManager.getConfig();

    console.log(chalk.cyan('\n🌐 Configuração do Acesso Remoto (Web UI)'));
    console.log(chalk.gray('(pressione ESC para cancelar)\n'));

    const enableRemote = await confirmWithEsc({
      message: 'Deseja habilitar o acesso remoto (Web UI) via ngrok?',
      default: config.remote?.enabled ?? false,
    });

    if (enableRemote === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    if (!enableRemote) {
      config.remote = { enabled: false };
      await this.configManager.saveConfig(config);
      console.log(chalk.green(`\n✓ Acesso Remoto desabilitado.\n`));
      return;
    }

    const passwordRaw = await inputWithEsc({
      message: 'Defina uma senha para acessar a Web UI:',
      default: config.remote?.password || '',
      validate: (v) => v.trim().length > 0 ? true : 'A senha não pode ser vazia',
    });

    if (passwordRaw === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }
    const password = passwordRaw.trim();

    let openaiApiKey = config.remote?.openaiApiKey;
    if (!openaiApiKey && config.providers.openai?.apiKey) {
      const useExistingOpenAI = await confirmWithEsc({
        message: 'Deseja usar sua API Key da OpenAI atual para transcrição Whisper de áudio?',
        default: true,
      });
      if (useExistingOpenAI === null) return;
      if (useExistingOpenAI) {
        openaiApiKey = config.providers.openai.apiKey;
      }
    }

    if (!openaiApiKey) {
      const requestKey = await confirmWithEsc({
        message: 'Deseja configurar uma API Key da OpenAI específica para transcrição de áudio?',
        default: false,
      });

      if (requestKey === null) return;
      if (requestKey) {
        const keyRaw = await inputWithEsc({
          message: 'OpenAI API Key para Whisper:',
          validate: (v) => v.trim().length > 10 ? true : 'Insira uma key válida',
        });
        if (keyRaw === null) return;
        openaiApiKey = keyRaw.trim();
      }
    }

    let ngrokAuthToken = config.remote?.ngrokAuthToken;
    const requestNgrokToken = await inputWithEsc({
      message: '(Opcional) Ngrok Authtoken (Necessário para o túnel online):\nDeixe em branco se já configurou globalmente seu ngrok:',
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
    console.log(chalk.green(`\n✓ Acesso Remoto configurado com sucesso!\n`));
  }
}
