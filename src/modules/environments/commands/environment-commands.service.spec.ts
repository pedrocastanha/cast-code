import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { EnvironmentCommandsService } from './environment-commands.service';

describe('EnvironmentCommandsService', () => {
  test('uses the detected Cast project root when listing environments', async () => {
    const calls: string[] = [];
    const resolver = {
      list: async (projectRoot: string) => {
        calls.push(`list:${projectRoot}`);
        return [];
      },
      getActive: async (projectRoot: string) => {
        calls.push(`active:${projectRoot}`);
        return null;
      },
    };
    const service = new EnvironmentCommandsService(resolver as any, {} as any);
    (service as any).projectLoader = {
      detectProject: async () => '/repo-root',
    };

    await service.cmdEnv(['list']);

    assert.deepEqual(calls, ['list:/repo-root', 'active:/repo-root']);
  });
});
