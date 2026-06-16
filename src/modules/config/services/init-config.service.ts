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
  ProvidersConfig,
  BaseProviderConfig,
  ModelPurpose,
  getModelChoicesForPurpose,
  getRecommendedModel,
  providerAllowsOptionalApiKey,
  providerRequiresBaseUrl,
} from '../types/config.types';
import {
  selectWithEsc,
  inputWithEsc,
  confirmWithEsc,
  CancelledPromptError,
} from '../../repl/utils/prompts-with-esc';

@Injectable()
export class InitConfigService {
  constructor(private readonly configManager: ConfigManagerService) { }

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
        (config.providers as Record<string, BaseProviderConfig>)[provider] = providerConfig;
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

    console.log(chalk.cyan('\n🌐 Configuração de Acesso Remoto (Web UI)\n'));
    console.log(
      'O Cast Code pode rodar uma Interface Web via ngrok que permite conversar e enviar áudios pelo navegador.\n'
    );
    const remoteConfigured = await this.configureRemote(config);
    if (!remoteConfigured) {
      console.log(chalk.yellow('\n❌ Configuração cancelada.\n'));
      return;
    }

    console.log(chalk.cyan('\n🔷 Configuração do Azure DevOps (opcional)\n'));
    console.log('Necessário apenas se você abre PRs no Azure DevOps. Pode pular.\n');
    const azureConfigured = await this.configureAzure(config);
    if (!azureConfigured) {
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
      const selected = await checkbox<ProviderType | 'none'>({
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
  ): Promise<ProvidersConfig[ProviderType] | null> {
    const meta = PROVIDER_METADATA[provider];

    if (meta.setupHints?.length) {
      for (const hint of meta.setupHints) {
        console.log(chalk.gray(`  → ${hint}`));
      }
    }

    if (meta.exampleBaseUrls?.length) {
      console.log(chalk.gray(`  → Exemplos: ${meta.exampleBaseUrls.join('  |  ')}`));
    }

    if (providerRequiresBaseUrl(provider)) {
      const baseUrl = await inputWithEsc({
        message: provider === 'ollama' ? 'URL do servidor Ollama:' : 'Base URL do endpoint OpenAI-compatible:',
        default: meta.defaultBaseUrl,
      });
      if (baseUrl === null) return null;

      if (providerAllowsOptionalApiKey(provider)) {
        const apiKeyRaw = await inputWithEsc({
          message: `API Key para ${meta.name} (opcional):`,
        });
        if (apiKeyRaw === null) return null;
        const apiKey = apiKeyRaw.trim();
        return {
          baseUrl: baseUrl.trim(),
          ...(apiKey ? { apiKey } : {}),
        };
      }

      return { baseUrl: baseUrl.trim() };
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

    return { apiKey, ...(baseUrl ? { baseUrl: baseUrl.trim() } : {}) };
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
    const configuredDefaultModel = config.models.default;

    const configureOthers = await confirmWithEsc({
      message: 'Deseja configurar modelos específicos para outras finalidades?',
      default: true,
    });

    if (configureOthers === null) return false;

    if (!configureOthers) {
      MODEL_PURPOSES.forEach((purpose) => {
        if (purpose.value !== 'default') {
          config.models[purpose.value] = {
            provider: configuredDefaultModel.provider,
            model: configuredDefaultModel.model,
            ...(configuredDefaultModel.temperature !== undefined ? { temperature: configuredDefaultModel.temperature } : {}),
            ...(configuredDefaultModel.maxTokens !== undefined ? { maxTokens: configuredDefaultModel.maxTokens } : {}),
          };
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
    purpose: ModelPurpose,
    availableProviders: ProviderType[],
    _providersConfig: CastConfig['providers'],
    defaultModel?: ModelConfig
  ): Promise<ModelConfig | null> {
    const providerChoices = availableProviders.map((p) => ({
      name: `${PROVIDER_METADATA[p].name}${
        getRecommendedModel(p, purpose)
          ? ` - rec ${getRecommendedModel(p, purpose)}`
          : ''
      }`,
      value: p,
    }));

    const provider = await selectWithEsc<ProviderType>({
      message: `Provedor para ${purpose}:`,
      choices: providerChoices,
      default: defaultModel?.provider,
    });

    if (provider === null) return null;

    const meta = PROVIDER_METADATA[provider];
    const recommendedModel = getRecommendedModel(provider, purpose);
    const modelChoices = getModelChoicesForPurpose(provider, purpose);

    if (recommendedModel) {
      console.log(chalk.gray(`  → Recomendado para ${purpose}: ${recommendedModel}`));
    }

    const selectChoices = [
      ...modelChoices.map((choice) => ({ name: choice.label, value: choice.value })),
      { name: 'Outro (customizado)', value: '__custom__' },
    ];

    let model: string;
    const selectedModel = await selectWithEsc<string>({
      message: `Modelo para ${purpose}:`,
      choices: selectChoices,
      default: defaultModel?.model || recommendedModel,
    });

    if (selectedModel === null) return null;

    if (selectedModel === '__custom__') {
      const customModel = await inputWithEsc({
        message: 'Nome do modelo:',
        default: defaultModel?.model || recommendedModel || meta.popularModels[0],
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

  private async configureRemote(config: CastConfig): Promise<boolean> {
    const enableRemote = await confirmWithEsc({
      message: 'Deseja habilitar o acesso remoto (Web UI) com ngrok?',
      default: false,
    });

    if (enableRemote === null) return false;

    if (!enableRemote) {
      config.remote = { enabled: false };
      return true;
    }

    const passwordRaw = await inputWithEsc({
      message: 'Defina uma senha para acessar a Web UI:',
      validate: (v) => v.trim().length > 0 ? true : 'A senha não pode ser vazia',
    });

    if (passwordRaw === null) return false;
    const password = passwordRaw.trim();

    let openaiApiKey: string | undefined = undefined;

    if (config.providers.openai?.apiKey) {
      const useExistingOpenAI = await confirmWithEsc({
        message: 'Deseja usar sua API Key da OpenAI atual para transcrição Whisper de áudio?',
        default: true,
      });
      if (useExistingOpenAI === null) return false;
      if (useExistingOpenAI) {
        openaiApiKey = config.providers.openai.apiKey;
      }
    }

    if (!openaiApiKey) {
      const requestKey = await confirmWithEsc({
        message: 'Deseja configurar uma API Key da OpenAI específica para transcrição de áudio?',
        default: false,
      });

      if (requestKey === null) return false;
      if (requestKey) {
        const keyRaw = await inputWithEsc({
          message: 'OpenAI API Key para Whisper:',
          validate: (v) => v.trim().length > 10 ? true : 'Insira uma key válida',
        });
        if (keyRaw === null) return false;
        openaiApiKey = keyRaw.trim();
      }
    }

    let ngrokAuthToken: string | undefined = undefined;
    const requestNgrokToken = await inputWithEsc({
      message: '(Opcional) Ngrok Authtoken (Necessário para o túnel online):\nDeixe em branco se já configurou globalmente seu ngrok:',
    });
    if (requestNgrokToken === null) return false;

    if (requestNgrokToken.trim().length > 0) {
      ngrokAuthToken = requestNgrokToken.trim();
    }

    config.remote = {
      enabled: true,
      password,
      openaiApiKey,
      ngrokAuthToken,
    };

    return true;
  }

  private async configureAzure(config: CastConfig): Promise<boolean> {
    const enable = await confirmWithEsc({
      message: 'Deseja configurar o Azure DevOps agora?',
      default: false,
    });
    if (enable === null) return false;
    if (!enable) return true;

    const patRaw = await inputWithEsc({
      message: 'Personal Access Token (Code: Read & Write):',
      validate: (v) => v.trim().length > 0 ? true : 'O PAT não pode ser vazio',
    });
    if (patRaw === null) return false;

    const orgRaw = await inputWithEsc({
      message: 'Organization URL (ex: https://dev.azure.com/myorg):',
      validate: (v) => v.trim().length > 0 ? true : 'A Organization URL é obrigatória',
    });
    if (orgRaw === null) return false;

    const projectRaw = await inputWithEsc({
      message: 'Nome do projeto:',
      validate: (v) => v.trim().length > 0 ? true : 'O projeto é obrigatório',
    });
    if (projectRaw === null) return false;

    const reviewersRaw = await inputWithEsc({
      message: '(Opcional) Reviewers obrigatórios, separados por vírgula:',
    });
    if (reviewersRaw === null) return false;
    const reviewers = reviewersRaw.split(',').map((r) => r.trim()).filter((r) => r.length > 0);

    config.azureDevops = {
      pat: patRaw.trim(),
      organizationUrl: orgRaw.trim(),
      project: projectRaw.trim(),
      ...(reviewers.length > 0 ? { reviewers } : {}),
    };

    return true;
  }
}
