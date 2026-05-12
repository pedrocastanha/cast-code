import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ConfigCommandsService } from './config-commands.service';

describe('ConfigCommandsService platform config display', () => {
  test('shows global Cast Platform config without exposing the API key', async () => {
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

      assert.match(output, /Cast Platform/i);
      assert.match(output, /http:\/\/localhost:3022/);
      assert.match(output, /configured/i);
      assert.doesNotMatch(output, /csk_global_secret_value/);
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
