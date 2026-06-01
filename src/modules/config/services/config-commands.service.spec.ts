import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ConfigCommandsService } from './config-commands.service';

describe('ConfigCommandsService platform config display', () => {
  test('does not manage Cast Platform from /config anymore', async () => {
    const configManager = {
      loadConfig: async () => {},
      getConfig: () => ({
        version: 1,
        providers: {},
        models: {},
        platform: {
          apiKey: 'csk_global_secret_value',
          apiUrl: 'http://localhost:3022',
        },
      }),
      getConfiguredProviders: () => [],
      getConfigPath: () => '/tmp/cast-config.yaml',
    };
    const service = new ConfigCommandsService(configManager as any, {} as any, {} as any);
    const originalWrite = process.stdout.write;
    let output = '';
    try {
      process.stdout.write = ((chunk: unknown) => {
        output += String(chunk);
        return true;
      }) as typeof process.stdout.write;

      await service.handleConfigCommand(['show']);

      assert.doesNotMatch(output, /Cast Platform/i);
      assert.doesNotMatch(output, /http:\/\/localhost:3022/);
      assert.doesNotMatch(output, /csk_global_secret_value/);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  test('interactive /config menu does not offer platform setup', async () => {
    const configManager = {
      loadConfig: async () => {},
      getConfig: () => ({
        version: 1,
        providers: {},
        models: {},
      }),
      getConfiguredProviders: () => [],
      getConfigPath: () => '/tmp/cast-config.yaml',
    };
    const choicesSeen: Array<Array<{ label: string }>> = [];
    const service = new ConfigCommandsService(configManager as any, {} as any, {} as any);
    const originalWrite = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;

      await service.handleConfigCommand([], {
        askChoice: async (_message: string, choices: Array<{ label: string }>) => {
          choicesSeen.push(choices);
          return '9';
        },
      } as any);

      assert.equal(choicesSeen.length, 1);
      assert.equal(
        choicesSeen[0].some((choice) => /Platform/i.test(choice.label)),
        false,
      );
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
