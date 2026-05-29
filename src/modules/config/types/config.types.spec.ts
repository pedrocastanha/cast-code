import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getProviderEndpointKind,
  getProviderEndpointLabel,
  getModelChoicesForPurpose,
  getRecommendedModel,
  isRecommendedModelForPurpose,
  MODEL_PURPOSES,
  PROVIDER_METADATA,
  providerAllowsOptionalApiKey,
  providerRequiresBaseUrl,
  providerUsesOpenAICompatibleApi,
} from './config.types';

// Validate PROVIDER_METADATA entries expose every provider with consistent required fields.
test('PROVIDER_METADATA contains complete metadata for every provider type', () => {
  const entries = Object.entries(PROVIDER_METADATA);
  assert(entries.length > 0, 'Expected at least one provider definition');

  for (const [providerKey, metadata] of entries) {
    assert.strictEqual(metadata.type, providerKey, 'Metadata type should match the dictionary key');
    assert.ok(typeof metadata.name === 'string' && metadata.name.trim().length > 0, 'Provider name must be a non-empty string');
    assert.ok(typeof metadata.description === 'string' && metadata.description.length > 0, 'Provider description must exist');
    assert.ok(typeof metadata.requiresApiKey === 'boolean', 'requiresApiKey must always exist');
    assert.ok(typeof metadata.websiteUrl === 'string' && metadata.websiteUrl.startsWith('http'), 'Providers must expose a website URL');
    assert.ok(Array.isArray(metadata.popularModels) && metadata.popularModels.length > 0, 'Each provider should list at least one popular model');
    assert.ok(typeof metadata.defaultBaseUrl === 'string', 'Providers should specify defaultBaseUrl');
  }
});

// Confirm OpenRouter configuration references a well-known popular model and correct base URL.
test('OpenRouter metadata highlights a known popular model and base URL', () => {
  const openRouter = PROVIDER_METADATA.openrouter;
  assert.strictEqual(openRouter.type, 'openrouter');
  assert.strictEqual(openRouter.defaultBaseUrl, 'https://openrouter.ai/api/v1');
  assert.ok(
    openRouter.popularModels.includes('moonshotai/kimi-k2.6'),
    'OpenRouter provider should advertise the current Kimi model in its popular collection'
  );
  assert.ok(
    openRouter.popularModels.includes('google/gemma-3-27b-it'),
    'OpenRouter provider should expose Gemma as an open model choice'
  );
});

test('Provider helpers classify self-hosted and OpenAI-compatible providers correctly', () => {
  assert.strictEqual(providerRequiresBaseUrl('ollama'), true);
  assert.strictEqual(providerRequiresBaseUrl('selfhosted'), true);
  assert.strictEqual(providerRequiresBaseUrl('openai'), false);

  assert.strictEqual(providerAllowsOptionalApiKey('selfhosted'), true);
  assert.strictEqual(providerAllowsOptionalApiKey('openai'), false);

  assert.strictEqual(providerUsesOpenAICompatibleApi('qwen'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('glm'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('mistral'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('xai'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('groq'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('cohere'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('perplexity'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('together'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('fireworks'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('huggingface'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('cerebras'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('selfhosted'), true);
  assert.strictEqual(providerUsesOpenAICompatibleApi('anthropic'), false);
  assert.strictEqual(getProviderEndpointKind('ollama'), 'local');
  assert.strictEqual(getProviderEndpointKind('openai'), 'official');
  assert.strictEqual(getProviderEndpointKind('selfhosted'), 'compatible');
  assert.strictEqual(getProviderEndpointLabel('selfhosted'), 'openai-compatible');
});

test('Recommended model helpers surface provider-specific defaults first', () => {
  assert.strictEqual(getRecommendedModel('openai', 'default'), 'gpt-5-mini');
  assert.strictEqual(getRecommendedModel('glm', 'coder'), 'glm-4.6');
  assert.strictEqual(getRecommendedModel('cohere', 'default'), 'command-a-plus-05-2026');
  assert.strictEqual(getRecommendedModel('huggingface', 'cheap'), 'google/gemma-3-27b-it');
  assert.strictEqual(getRecommendedModel('selfhosted', 'coder'), 'qwen3-32b');
  assert.strictEqual(isRecommendedModelForPurpose('openai', 'default', 'gpt-5-mini'), true);
  assert.strictEqual(isRecommendedModelForPurpose('openai', 'default', 'gpt-5.4'), false);

  const selfHostedChoices = getModelChoicesForPurpose('selfhosted', 'coder');
  assert.ok(selfHostedChoices.length > 0, 'Expected at least one self-hosted model choice');
  assert.strictEqual(selfHostedChoices[0]?.value, 'qwen3-32b');
  assert.ok(
    selfHostedChoices[0]?.label.includes('recommended'),
    'First recommended choice should be labeled as recommended'
  );
});

// Ensure MODEL_PURPOSES now documents the tester purpose with accurate label and description.
test('MODEL_PURPOSES includes tester purpose with descriptive metadata', () => {
  const testerEntry = MODEL_PURPOSES.find((purpose) => purpose.value === 'tester');
  assert.ok(testerEntry, 'Tester purpose entry must exist');
  assert.strictEqual(testerEntry?.label, 'Tester');
  assert.ok(
    testerEntry?.description.includes('teste'),
    'Tester description should mention test-related responsibilities'
  );
});

// Verify MODEL_PURPOSES stays complete and free of duplicates compared to the declared catalog.
test('MODEL_PURPOSES values remain unique and match the expected catalog', () => {
  const expectedOrder: Array<typeof MODEL_PURPOSES[number]['value']> = [
    'default',
    'subAgent',
    'coder',
    'architect',
    'reviewer',
    'planner',
    'tester',
    'cheap',
  ];

  const actualValues = MODEL_PURPOSES.map((item) => item.value);
  const uniqueValues = new Set(actualValues);

  assert.strictEqual(actualValues.length, expectedOrder.length, 'MODEL_PURPOSES must cover the full catalog of purposes');
  assert.strictEqual(uniqueValues.size, actualValues.length, 'MODEL_PURPOSES should not contain duplicate values');
  assert.deepStrictEqual(actualValues, expectedOrder, 'MODEL_PURPOSES should stay in the documented order');
});
