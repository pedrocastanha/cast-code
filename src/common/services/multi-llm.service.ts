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
  providerUsesOpenAICompatibleApi,
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

    const { provider, model, temperature } = modelConfig;
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
    temperature: number | undefined,
    streaming: boolean
  ): BaseChatModel {
    if (providerUsesOpenAICompatibleApi(provider)) {
      return this.createOpenAiCompatibleModel(
        provider,
        config,
        model,
        temperature,
        streaming
      );
    }

    switch (provider) {
      case 'anthropic':
        return new ChatAnthropic({
          modelName: model,
          ...(temperature !== undefined ? { temperature } : {}),
          anthropicApiKey: config.apiKey,
          anthropicApiUrl: config.baseUrl,
          streaming,
        });

      case 'gemini':
        return new ChatGoogleGenerativeAI({
          model,
          ...(temperature !== undefined ? { temperature } : {}),
          apiKey: config.apiKey,
          streaming,
        });

      case 'ollama':
        return new ChatOllama({
          model,
          ...(temperature !== undefined ? { temperature } : {}),
          baseUrl: config.baseUrl || 'http://localhost:11434',
        });

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private requiresResponsesApi(model: string): boolean {
    const normalized = (model || '').toLowerCase();
    return normalized.startsWith('gpt-5') || normalized.includes('codex');
  }

  private createOpenAiCompatibleModel(
    provider: ProviderType,
    config: { apiKey?: string; baseUrl?: string },
    model: string,
    temperature: number | undefined,
    streaming: boolean
  ): BaseChatModel {
    const baseURL = config.baseUrl || this.getDefaultBaseUrl(provider);
    const apiKey = config.apiKey || 'not-required';

    return new ChatOpenAI({
      modelName: model,
      ...(temperature !== undefined ? { temperature } : {}),
      apiKey,
      configuration: {
        ...(baseURL ? { baseURL } : {}),
      },
      ...(provider === 'openai' && this.requiresResponsesApi(model)
        ? { useResponsesApi: true }
        : {}),
      streaming,
      streamUsage: streaming,
      ...(provider === 'openai' && streaming ? { parallelToolCalls: true } : {}),
    });
  }

  private getDefaultBaseUrl(provider: ProviderType): string | undefined {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'kimi':
        return 'https://api.moonshot.ai/v1';
      case 'qwen':
        return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      case 'glm':
        return 'https://open.bigmodel.cn/api/paas/v4';
      case 'deepseek':
        return 'https://api.deepseek.com';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1';
      case 'selfhosted':
        return 'http://localhost:1234/v1';
      default:
        return undefined;
    }
  }
}
