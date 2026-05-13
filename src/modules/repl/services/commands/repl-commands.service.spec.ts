import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ReplCommandsService } from './repl-commands.service';

function captureStdout(run: () => void): string {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stdout.write;

  try {
    run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return output;
}

test('cmdContext displays the active configured model instead of the legacy fallback', () => {
  const service = new ReplCommandsService(
    {
      getMessageCount: () => 2,
      getTokenCount: () => 20_000,
    } as any,
    {
      getProvider: () => 'openai',
      getModel: () => 'gpt-5.4-mini',
    } as any,
    {
      getModelConfig: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }),
    } as any,
    { getServerSummaries: () => [] } as any,
    { getAllAgents: () => [] } as any,
    { getAllSkills: () => [] } as any,
    { hasContext: () => false } as any,
    { isInitialized: () => true } as any,
  );

  const output = captureStdout(() => service.cmdContext());

  assert.match(output, /openai\/gpt-4\.1-mini/);
  assert.doesNotMatch(output, /openai\/gpt-5\.4-mini/);
  assert.match(output, /Context/i);
  assert.match(output, /98\.1%/);
  assert.match(output, /1M/);
});

test('printHelp advertises /platform instead of the removed /link flow', () => {
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
      getModelConfig: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }),
    } as any,
    { getServerSummaries: () => [] } as any,
    { getAllAgents: () => [] } as any,
    { getAllSkills: () => [] } as any,
    { hasContext: () => false } as any,
    { isInitialized: () => false } as any,
  );

  const output = captureStdout(() => service.printHelp());

  assert.match(output, /\/platform/);
  assert.doesNotMatch(output, /\/link/);
});

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

test('cmdEffort opens an interactive menu and persists the selected level', async () => {
  const setEffortCalls: string[] = [];
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
      getEffort: () => 'balanced',
      setEffort: async (level: string) => { setEffortCalls.push(level); },
      getConfig: () => ({
        effort: 'balanced',
        models: {
          default: { provider: 'openai', model: 'gpt-4.1-mini' },
        },
      }),
    } as any,
    { getServerSummaries: () => [] } as any,
    { getAllAgents: () => [] } as any,
    { getAllSkills: () => [] } as any,
    { hasContext: () => false } as any,
    { isInitialized: () => false } as any,
  );

  const smartInput = {
    askChoice: async (message: string, choices: Array<{ key: string }>) => {
      assert.equal(message, 'Effort level');
      assert.deepStrictEqual(choices.map((choice) => choice.key), ['fast', 'balanced', 'deep', 'max']);
      return 'deep';
    },
    question: async () => '',
  };

  const changed = await service.cmdEffort([], smartInput as any);

  assert.equal(changed, true);
  assert.deepStrictEqual(setEffortCalls, ['deep']);
});
