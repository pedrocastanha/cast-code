import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MultiLlmService } from './multi-llm.service';

describe('MultiLlmService effort settings', () => {
  test('applies maxTokens from the selected effort profile and model config', () => {
    const service = new MultiLlmService({
      getModelConfig: () => ({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        maxTokens: 777,
      }),
      getProviderConfig: () => ({ apiKey: 'test-key' }),
      getEffort: () => 'fast',
    } as any);

    const model = service.createModel('default', true) as any;

    assert.equal(model.model, 'gpt-4.1-mini');
    assert.equal(model.maxTokens, 777);
    assert.equal(model.streaming, true);
  });

  test('uses effort output budget when the model config does not set maxTokens', () => {
    const service = new MultiLlmService({
      getModelConfig: () => ({
        provider: 'openai',
        model: 'gpt-4.1-mini',
      }),
      getProviderConfig: () => ({ apiKey: 'test-key' }),
      getEffort: () => 'max',
    } as any);

    const model = service.createModel('default') as any;

    assert.equal(model.maxTokens, 12000);
  });
});
