import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MODEL_PURPOSES, PROVIDER_METADATA } from './config.types';

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
    openRouter.popularModels.includes('openai/gpt-5'),
    'OpenRouter provider should advertise the openai/gpt-5 model in its popular collection'
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
