import { Injectable } from '@nestjs/common';
import {
  checkbox,
  Separator,
} from '@inquirer/prompts';
import chalk from 'chalk';
import { ConfigManagerService } from './config-manager.service';
import {
  ProviderType,
  PROVIDER_METADATA,
  MODEL_PURPOSES,
  ModelConfig,
  CastConfig,
} from '../types/config.types';
import {
  selectWithEsc,
  inputWithEsc,
  confirmWithEsc,
  CancelledPromptError,
} from '../../repl/utils/prompts-with-esc';

@Injectable()
export class InitConfigService {
  constructor(private readonly configManager: ConfigManagerService) {}

  async runInitialSetup(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Bem-vindo ao Cast Code!\n'));
    console.log(
      'Vamos configurar seus provedores de IA e modelos. ' +
        'Você pode configurar múltiplos provedores e atribuir modelos diferentes para diferentes tarefas.\n'
    );
    console.log(chalk.gray('(pressione ESC a qualquer momento para cancelar)\n'));

    const config: CastConfig = {
      version: 1,
      providers: {},
      models: {},
    };

    const selectedProviders = await this.selectProviders();

    if (selectedProviders.length === 0) {
      console.log(chalk.yellow('Nenhum provedor selecionado. Configuração cancelada.'));
      return;
    }

    for (const provider of selectedProviders) {
      console.log(chalk.cyan(`\n📦 Configurando ${PROVIDER_METADATA[provider].name}...`));
      const providerConfig = await this.configureProvider(provider);
      if (providerConfig === null) {
        console.log(chalk.yellow('\n❌ Configuração cancelada.\n'));
        return;
      }
      if (providerConfig) {
        config.providers[provider] = providerConfig;
      }
    }

    console.log(chalk.cyan('\n🤖 Configurando Modelos por Finalidade\n'));
    console.log(
      'Agora você pode configurar diferentes modelos para diferentes tarefas. ' +
        'Por exemplo, usar um modelo mais barato para sub-agentes, ou um mais poderoso para arquitetura.\n'
    );

    const availableProviders = selectedProviders.filter(
      (p) => config.providers[p]
    );

    const modelsConfigured = await this.configureModels(config, availableProviders);
    if (!modelsConfigured) {
      console.log(chalk.yellow('\n❌ Configuração cancelada.\n'));
      return;
    }

    await this.configManager.saveConfig(config);

    console.log(chalk.green.bold('\n✅ Configuração salva com sucesso!\n'));
    console.log(`Arquivo de configuração: ${chalk.gray(this.configManager.getConfigPath())}\n`);
    console.log(chalk.cyan('Próximos passos:'));
    console.log('  • Rode "cast" para iniciar a CLI');
    console.log('  • Use "cast config" para editar as configurações depois');
    console.log();
  }

  private async selectProviders(): Promise<ProviderType[]> {
    const choices = [
      ...Object.values(PROVIDER_METADATA).map((meta) => ({
        name: `${meta.name} - ${meta.description}`,
        value: meta.type,
        checked: meta.type === 'openai',
      })),
      new Separator(),
      {
        name: 'Nenhum (cancelar)',
        value: 'none' as ProviderType,
      },
    ];

    try {
      const selected = await checkbox<ProviderType>({
        message: 'Selecione os provedores de IA que deseja configurar:',
        choices,
        pageSize: 12,
      });

      return selected.filter((s): s is ProviderType => s !== 'none');
    } catch (error: any) {
      if (error instanceof CancelledPromptError || error.name === 'CancelledPromptError') {
        console.log(chalk.yellow('\n\n❌ Cancelado pelo usuário.\n'));
        return [];
      }
      throw error;
    }
  }

  private async configureProvider(
    provider: ProviderType
  ): Promise<{ apiKey?: string; baseUrl?: string } | null> {
    const meta = PROVIDER_METADATA[provider];

    if (provider === 'ollama') {
      const baseUrl = await inputWithEsc({
        message: 'URL do servidor Ollama:',
        default: meta.defaultBaseUrl,
      });
      if (baseUrl === null) return null;
      return { baseUrl };
    }

    console.log(chalk.gray(`  → Obtenha sua API key em: ${meta.websiteUrl}`));

    const apiKeyRaw = await inputWithEsc({
      message: `API Key para ${meta.name}:`,
      validate: (value) => {
        const clean = value.trim();
        if (!clean || clean.length < 10) {
          return 'Por favor, insira uma API key válida';
        }
        if (/[\s%]/.test(clean)) {
          return 'API key contém caracteres inválidos (espaços ou %)';
        }
        return true;
      },
    });

    if (apiKeyRaw === null) return null;
    const apiKey = apiKeyRaw.trim();

    const useCustomUrl = await confirmWithEsc({
      message: 'Usar URL de API customizada (ex: OpenRouter, proxy)?',
      default: false,
    });

    if (useCustomUrl === null) return null;

    let baseUrl: string | undefined;
    if (useCustomUrl) {
      baseUrl = await inputWithEsc({
        message: 'URL da API:',
        default: meta.defaultBaseUrl,
      });
      if (baseUrl === null) return null;
    }

    console.log(chalk.gray(`  → Modelos populares: ${meta.popularModels.join(', ')}`));

    return { apiKey, baseUrl };
  }

  private async configureModels(
    config: CastConfig,
    availableProviders: ProviderType[]
  ): Promise<boolean> {
    console.log(chalk.yellow('→ Configurando modelo padrão (obrigatório)\n'));
    const defaultModel = await this.selectModelConfig(
      'default',
      availableProviders,
      config.providers
    );
    if (defaultModel === null) return false;
    config.models.default = defaultModel;

    const configureOthers = await confirmWithEsc({
      message: 'Deseja configurar modelos específicos para outras finalidades?',
      default: true,
    });

    if (configureOthers === null) return false;

    if (!configureOthers) {
      MODEL_PURPOSES.forEach((purpose) => {
        if (purpose.value !== 'default') {
          config.models[purpose.value] = { ...config.models.default };
        }
      });
      return true;
    }

    for (const purpose of MODEL_PURPOSES) {
      if (purpose.value === 'default') continue;

      const shouldConfigure = await confirmWithEsc({
        message: `Configurar modelo para "${purpose.label}" (${purpose.description})?`,
        default: purpose.value === 'subAgent',
      });

      if (shouldConfigure === null) return false;

      if (shouldConfigure) {
        const modelConfig = await this.selectModelConfig(
          purpose.value,
          availableProviders,
          config.providers,
          config.models.default
        );
        if (modelConfig === null) return false;
        config.models[purpose.value] = modelConfig;
      } else {
        config.models[purpose.value] = { ...config.models.default };
      }
    }

    return true;
  }

  private async selectModelConfig(
    purpose: string,
    availableProviders: ProviderType[],
    providersConfig: CastConfig['providers'],
    defaultModel?: ModelConfig
  ): Promise<ModelConfig | null> {
    const providerChoices = availableProviders.map((p) => ({
      name: PROVIDER_METADATA[p].name,
      value: p,
    }));

    const provider = await selectWithEsc<ProviderType>({
      message: `Provedor para ${purpose}:`,
      choices: providerChoices,
      default: defaultModel?.provider,
    });

    if (provider === null) return null;

    const meta = PROVIDER_METADATA[provider];

    const modelChoices = [
      ...meta.popularModels.map((m) => ({ name: m, value: m })),
      { name: 'Outro (customizado)', value: '__custom__' },
    ];

    let model: string;
    const selectedModel = await selectWithEsc<string>({
      message: `Modelo para ${purpose}:`,
      choices: modelChoices,
      default: defaultModel?.model,
    });

    if (selectedModel === null) return null;

    if (selectedModel === '__custom__') {
      const customModel = await inputWithEsc({
        message: 'Nome do modelo:',
        default: defaultModel?.model || meta.popularModels[0],
      });
      if (customModel === null) return null;
      model = customModel;
    } else {
      model = selectedModel;
    }

    return {
      provider,
      model,
    };
  }
}
