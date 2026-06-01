import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { z } from 'zod';
import { castTool as createTool } from '../../../common/interfaces/cast-tool.interface';
import { BridgeToolExecutorService } from './bridge-tool-executor.service';

const fakeTool = (name: string, response: string) =>
  createTool(async (input: { value?: string }) => `${response}:${JSON.stringify(input)}`, {
    name,
    description: `${name} description`,
    schema: z.object({ value: z.string().optional() }),
  });

describe('BridgeToolExecutorService', () => {
  test('executes a known bridge tool through the registry', async () => {
    const service = new BridgeToolExecutorService({
      getAllTools: () => [fakeTool('read_file', 'read')],
    } as any);

    const result = await service.execute({
      id: 'call_1',
      name: 'read_file',
      arguments: { value: 'package.json' },
      raw: '',
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.id, 'call_1');
    assert.match(result.content!, /read:/);
  });

  test('maps bridge argument aliases to existing tool schemas', async () => {
    let received: unknown;
    const service = new BridgeToolExecutorService({
      getAllTools: () => [
        createTool(async (input: { file_path: string }) => {
          received = input;
          return 'ok';
        }, {
          name: 'read_file',
          description: 'read file',
          schema: z.object({ file_path: z.string() }),
        }),
      ],
    } as any);

    await service.execute({
      id: 'call_1',
      name: 'read_file',
      arguments: { path: 'package.json' },
      raw: '',
    });

    assert.deepEqual(received, { file_path: 'package.json' });
  });

  test('returns structured errors for unknown tools', async () => {
    const service = new BridgeToolExecutorService({ getAllTools: () => [] } as any);

    const result = await service.execute({
      id: 'call_1',
      name: 'unknown',
      arguments: {},
      raw: '',
    });

    assert.equal(result.status, 'error');
    assert.match(result.error!, /Unknown bridge tool/i);
  });

  test('truncates large tool results', async () => {
    const service = new BridgeToolExecutorService({
      getAllTools: () => [fakeTool('grep', 'x'.repeat(70_000))],
    } as any);

    const result = await service.execute({
      id: 'call_1',
      name: 'grep',
      arguments: {},
      raw: '',
    });

    assert.equal(result.status, 'ok');
    assert(result.content!.length < 40_000);
    assert.match(result.content!, /truncated/i);
  });
});
