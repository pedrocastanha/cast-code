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
  numberWithEsc,
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
  ) {}

  async handleConfigCommand(args: string[], smartInput?: SmartInput): Promise<void> {
    const subcommand = args[0];
    
    // Pausa o smart-input para evitar conflitos com prompts
    smartInput?.pause();
    
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
      // Sempre retoma o smart-input no final
      smartInput?.resume();
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
        { key: '6', label: 'Ver caminho do arquivo', description: 'Local do config.yaml' },
        { key: '7', label: 'Sair', description: 'Voltar ao chat' },
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
          await this.withEscHandler(() => this.initService.runInitialSetup());
          return;
        case '3':
          await this.withEscHandler(() => this.addProviderInteractive());
          break;
        case '4':
          await this.withEscHandler(() => this.removeProviderInteractive());
          break;
        case '5':
          await this.withEscHandler(() => this.setModelInteractive());
          break;
        case '6':
          console.log(`\n📁 ${this.configManager.getConfigPath()}\n`);
          break;
        case '7':
          return;
      }
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

    // Providers
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

    // Models
    w(`\n${Colors.yellow}🤖 Modelos configurados:${Colors.reset}\n`);
    for (const purpose of MODEL_PURPOSES) {
      const modelConfig = config.models[purpose.value];
      if (modelConfig) {
        const providerName = PROVIDER_METADATA[modelConfig.provider].name;
        w(`   ${Colors.cyan}${purpose.label.padEnd(12)}${Colors.reset} → ${modelConfig.model}\n`);
        w(`   ${Colors.gray}${' '.repeat(12)}   ${providerName} (temp: ${modelConfig.temperature})${Colors.reset}\n`);
      }
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
      
      const apiKey = await inputWithEsc({
        message: `API Key para ${meta.name}:`,
        validate: (v) => v.length > 5 || 'API key muito curta',
      });

      if (apiKey === null) {
        console.log(chalk.yellow('\n❌ Cancelado.\n'));
        return;
      }

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

    const temperature = await numberWithEsc({
      message: 'Temperature (0.0 - 2.0):',
      default: 0.1,
      min: 0,
      max: 2,
    });

    if (temperature === null) {
      console.log(chalk.yellow('\n❌ Cancelado.\n'));
      return;
    }

    await this.configManager.setModel(purpose, {
      provider,
      model,
      temperature: temperature ?? 0.1,
    });

    const purposeLabel = MODEL_PURPOSES.find((p) => p.value === purpose)?.label;
    console.log(
      chalk.green(`\n✓ Modelo para "${purposeLabel}" configurado: ${model}\n`)
    );
  }
}
