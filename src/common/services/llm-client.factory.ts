import { Injectable } from '@nestjs/common';

import type { LlmClient } from '../interfaces/llm-client.interface';
import { AnthropicClient } from '../clients/anthropic.client';
import { GeminiClient } from '../clients/gemini.client';
import { OpenAICompatibleClient } from '../clients/openai-compatible.client';
import { ConfigManagerService } from '../../modules/config/services/config-manager.service';
import {
  EffortProfile,
  getEffortProfile,
  ModelConfig,
  ModelPurpose,
  ProviderType,
  providerUsesOpenAICompatibleApi,
} from '../../modules/config/types/config.types';

@Injectable()
export class LlmClientFactory {
  constructor(private readonly configManager: ConfigManagerService) {}

  create(purpose: ModelPurpose = 'default'): LlmClient {
    const modelConfig = this.configManager.getModelConfig(purpose);
    if (!modelConfig) {
      throw new Error(
        `No model configured for purpose "${purpose}". ` +
        'Run "cast config init" to configure.',
      );
    }

    const providerConfig = this.configManager.getProviderConfig(modelConfig.provider);
    if (!providerConfig) {
      throw new Error(
        `Provider "${modelConfig.provider}" is not configured. ` +
        'Run "cast config init" to configure.',
      );
    }

    return this.createForProvider(modelConfig.provider, providerConfig, modelConfig);
  }

  getCurrentEffortProfile(): EffortProfile {
    const effort = typeof (this.configManager as any).getEffort === 'function'
      ? (this.configManager as any).getEffort()
      : undefined;
    return getEffortProfile(effort);
  }

  createForProvider(
    provider: ProviderType,
    providerConfig: { apiKey?: string; baseUrl?: string },
    modelConfig: ModelConfig,
  ): LlmClient {
    const maxTokens = modelConfig.maxTokens ?? this.getCurrentEffortProfile().maxOutputTokens;
    const baseURL = providerConfig.baseUrl || this.getDefaultBaseUrl(provider);

    if (providerUsesOpenAICompatibleApi(provider) || provider === 'ollama') {
      return new OpenAICompatibleClient({
        provider,
        apiKey: providerConfig.apiKey || 'not-required',
        baseURL: this.normalizeBaseUrl(provider, baseURL),
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        maxTokens,
      });
    }

    if (provider === 'anthropic') {
      return new AnthropicClient({
        apiKey: providerConfig.apiKey || '',
        baseURL,
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        maxTokens,
      });
    }

    if (provider === 'gemini') {
      return new GeminiClient({
        apiKey: providerConfig.apiKey || '',
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        maxTokens,
      });
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  private normalizeBaseUrl(provider: ProviderType, baseURL: string | undefined): string {
    const value = baseURL || this.getDefaultBaseUrl(provider) || '';
    if (provider === 'ollama' && value && !value.replace(/\/$/, '').endsWith('/v1')) {
      return `${value.replace(/\/$/, '')}/v1`;
    }
    return value;
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
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    case 'xai':
      return 'https://api.x.ai/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'cohere':
      return 'https://api.cohere.ai/compatibility/v1';
    case 'perplexity':
      return 'https://api.perplexity.ai';
    case 'together':
      return 'https://api.together.ai/v1';
    case 'fireworks':
      return 'https://api.fireworks.ai/inference/v1';
    case 'huggingface':
      return 'https://router.huggingface.co/v1';
    case 'cerebras':
      return 'https://api.cerebras.ai/v1';
    case 'deepseek':
      return 'https://api.deepseek.com';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'selfhosted':
      return 'http://localhost:1234/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    default:
      return undefined;
    }
  }
}
