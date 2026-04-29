import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ReplCommandsService } from './repl-commands.service';

test('cmdModel can configure an unconfigured provider inline before saving the purpose model', async () => {
  const addProviderCalls: Array<{ provider: string; config: { apiKey?: string; baseUrl?: string } }> = [];
  const setModelCalls: Array<{ purpose: string; modelConfig: { provider: string; model: string } }> = [];

  const service = new ReplCommandsService(
    {
      getMessageCount: () => 0,
      getTokenCount: () => 0,
    } as any,
    {
      getProvider: () => 'openai',
      getModel: () => 'gpt-4.1-mini',
    } as any,
    {
      loadConfig: async () => {},
      getConfig: () => ({
        models: {
          default: { provider: 'openai', model: 'gpt-4.1-mini' },
        },
      }),
      getConfiguredProviders: () => ['openai'],
      isProviderConfigured: (provider: string) => provider === 'openai',
      getModelConfig: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }),
      addProvider: async (provider: string, config: { apiKey?: string; baseUrl?: string }) => {
        addProviderCalls.push({ provider, config });
      },
      setModel: async (purpose: string, modelConfig: { provider: string; model: string }) => {
        setModelCalls.push({ purpose, modelConfig });
      },
    } as any,
    { getServerSummaries: () => [] } as any,
    { getAllAgents: () => [] } as any,
    { getAllSkills: () => [] } as any,
    { hasContext: () => false } as any,
    { isInitialized: () => false } as any,
  );

  const answers = ['purpose', 'default', 'anthropic', 'sk-ant-1234567890', 'default', 'claude-sonnet-4-6'];
  const smartInput = {
    askChoice: async () => {
      const next = answers.shift();
      if (!next) {
        throw new Error('No more askChoice answers');
      }
      return next;
    },
    question: async () => {
      const next = answers.shift();
      if (!next) {
        throw new Error('No more question answers');
      }
      return next;
    },
  };

  const changed = await service.cmdModel([], smartInput as any);

  assert.strictEqual(changed, true);
  assert.deepStrictEqual(addProviderCalls, [
    {
      provider: 'anthropic',
      config: {
        apiKey: 'sk-ant-1234567890',
        baseUrl: undefined,
      },
    },
  ]);
  assert.deepStrictEqual(setModelCalls, [
    {
      purpose: 'default',
      modelConfig: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      },
    },
  ]);
});
