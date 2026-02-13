import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConfigManagerService } from '../../modules/config/services/config-manager.service';
import {
  ModelPurpose,
  ProviderType,
} from '../../modules/config/types/config.types';

@Injectable()
export class MultiLlmService {
  constructor(private readonly configManager: ConfigManagerService) {}

  createModel(purpose: ModelPurpose = 'default', streaming = false): BaseChatModel {
    const modelConfig = this.configManager.getModelConfig(purpose);

    if (!modelConfig) {
      throw new Error(
        `No model configured for purpose "${purpose}". ` +
          'Run "cast config init" to configure.'
      );
    }

    const { provider, model, temperature = 0.1 } = modelConfig;
    const providerConfig = this.configManager.getProviderConfig(provider);

    if (!providerConfig) {
      throw new Error(
        `Provider "${provider}" is not configured. ` +
          'Run "cast config init" to configure.'
      );
    }

    return this.createModelForProvider(
      provider,
      providerConfig,
      model,
      temperature,
      streaming
    );
  }

  createStreamingModel(purpose: ModelPurpose = 'default'): BaseChatModel {
    return this.createModel(purpose, true);
  }

  private createModelForProvider(
    provider: ProviderType,
    config: { apiKey?: string; baseUrl?: string },
    model: string,
    temperature: number,
    streaming: boolean
  ): BaseChatModel {
    switch (provider) {
      case 'openai':
      case 'deepseek':
      case 'openrouter':
        return new ChatOpenAI({
          modelName: model,
          temperature,
          openAIApiKey: config.apiKey,
          configuration: {
            baseURL: config.baseUrl,
          },
          streaming,
        });

      case 'anthropic':
        return new ChatAnthropic({
          modelName: model,
          temperature,
          anthropicApiKey: config.apiKey,
          anthropicApiUrl: config.baseUrl,
          streaming,
        });

      case 'gemini':
        return new ChatGoogleGenerativeAI({
          modelName: model,
          temperature,
          apiKey: config.apiKey,
          streaming,
        });

      case 'kimi':
        // Kimi usa API compatível com OpenAI
        return new ChatOpenAI({
          modelName: model,
          temperature,
          openAIApiKey: config.apiKey,
          configuration: {
            baseURL: config.baseUrl || 'https://api.moonshot.cn/v1',
          },
          streaming,
        });

      case 'ollama':
        return new ChatOllama({
          model,
          temperature,
          baseUrl: config.baseUrl || 'http://localhost:11434',
        });

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}
