import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatContextWindow,
  getModelContextUsage,
  getModelContextWindow,
} from './model-context';

test('getModelContextWindow returns official windows for configured hosted models', () => {
  assert.equal(getModelContextWindow('openai', 'gpt-4.1-mini'), 1_047_576);
  assert.equal(getModelContextWindow('openai', 'gpt-5.5'), 1_000_000);
  assert.equal(getModelContextWindow('openai', 'gpt-5.4'), 1_000_000);
  assert.equal(getModelContextWindow('openai', 'gpt-5.4-mini'), 400_000);
  assert.equal(getModelContextWindow('gemini', 'gemini-2.5-pro'), 1_048_576);
  assert.equal(getModelContextWindow('deepseek', 'deepseek-chat'), 1_000_000);
  assert.equal(getModelContextWindow('qwen', 'qwen3.6-plus'), 1_000_000);
  assert.equal(getModelContextWindow('qwen', 'qwen3.6-max-preview'), 262_144);
  assert.equal(getModelContextWindow('qwen', 'qwen3-max-preview'), 81_920);
  assert.equal(getModelContextWindow('glm', 'glm-4.5-flash'), 128_000);
});

test('getModelContextWindow maps OpenRouter and local model aliases to their backing windows', () => {
  assert.equal(getModelContextWindow('openrouter', 'google/gemini-2.5-pro'), 1_048_576);
  assert.equal(getModelContextWindow('openrouter', 'meta-llama/llama-3.1-70b-instruct'), 128_000);
  assert.equal(getModelContextWindow('ollama', 'qwen3'), 40_000);
  assert.equal(getModelContextWindow('selfhosted', 'qwen3-32b'), 262_144);
  assert.equal(getModelContextWindow('selfhosted', 'openai/gpt-oss-20b'), 128_000);
});

test('getModelContextUsage returns remaining percentage from current token usage', () => {
  const usage = getModelContextUsage('openai', 'gpt-4.1-mini', 20_000);

  assert(usage, 'usage should be available for known models');
  assert.equal(usage.contextWindow, 1_047_576);
  assert.equal(usage.usedTokens, 20_000);
  assert.equal(usage.remainingTokens, 1_027_576);
  assert.equal(usage.remainingPercentLabel, '98.1%');
});

test('formatContextWindow keeps footer labels compact', () => {
  assert.equal(formatContextWindow(1_048_576), '1M');
  assert.equal(formatContextWindow(400_000), '400k');
  assert.equal(formatContextWindow(81_920), '81.9k');
});
