import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { LlmClientFactory } from './llm-client.factory';
import { OpenAICompatibleClient } from '../clients/openai-compatible.client';

describe('LlmClientFactory', () => {
  test('creates OpenAI-compatible clients with effort fallback max tokens', () => {
    const factory = new LlmClientFactory({
      getModelConfig: () => ({ provider: 'openrouter', model: 'openai/gpt-test' }),
      getProviderConfig: () => ({ apiKey: 'router-key' }),
      getEffort: () => 'max',
    } as any);

    const client = factory.create('default');

    assert.ok(client instanceof OpenAICompatibleClient);
    assert.equal(client.getProviderName(), 'openrouter');
    assert.equal(client.getModelName(), 'openai/gpt-test');
    assert.equal((client as any).config.maxTokens, 12000);
    assert.equal((client as any).config.baseURL, 'https://openrouter.ai/api/v1');
  });

  test('throws a clear error when model config is missing', () => {
    const factory = new LlmClientFactory({
      getModelConfig: () => undefined,
      getProviderConfig: () => undefined,
      getEffort: () => 'fast',
    } as any);

    assert.throws(() => factory.create('coder'), /No model configured for purpose "coder"/);
  });

  test('uses researched OpenAI-compatible base URLs for major providers', () => {
    const cases = [
      ['mistral', 'https://api.mistral.ai/v1'],
      ['xai', 'https://api.x.ai/v1'],
      ['groq', 'https://api.groq.com/openai/v1'],
      ['cohere', 'https://api.cohere.ai/compatibility/v1'],
      ['perplexity', 'https://api.perplexity.ai'],
      ['together', 'https://api.together.ai/v1'],
      ['fireworks', 'https://api.fireworks.ai/inference/v1'],
      ['huggingface', 'https://router.huggingface.co/v1'],
      ['cerebras', 'https://api.cerebras.ai/v1'],
    ] as const;

    for (const [provider, baseURL] of cases) {
      const factory = new LlmClientFactory({
        getProviderConfig: () => ({ apiKey: 'provider-key' }),
        getEffort: () => 'fast',
      } as any);

      const client = factory.createForProvider(
        provider,
        { apiKey: 'provider-key' },
        { provider, model: 'model-id' },
      );

      assert.ok(client instanceof OpenAICompatibleClient);
      assert.equal(client.getProviderName(), provider);
      assert.equal((client as any).config.baseURL, baseURL);
    }
  });
});
