import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BridgeCommandsService } from './bridge-commands.service';
import { stripAnsi } from '../../../ui/cast-design/cli-renderer';

describe('BridgeCommandsService', () => {
  test('prints status for a connected claude bridge', () => {
    const service = new BridgeCommandsService(
      {
        start: async () => {},
        stop: () => {},
        setAdapter: () => {},
        getStatus: () => 'connected',
        getProviderId: () => 'claude',
        getProviderLabel: () => 'Claude CLI',
        write: async () => {},
      } as any,
      { getManifest: () => ({ tools: [{ name: 'read_file', description: 'read', inputSchema: {} }] }) } as any,
      {} as any,
      {} as any,
    );

    const status = service.getStatusPanel();

    const plain = stripAnsi(status);
    assert.match(plain, /Bridge Status/);
    assert.match(plain, /Provider\s+Claude CLI/);
    assert.match(plain, /Status\s+connected/);
    assert.match(plain, /Tools\s+1/);
  });

  test('starts claude from /bridge claude', async () => {
    let started = false;
    const service = new BridgeCommandsService(
      {
        setAdapter: () => {},
        start: async () => {
          started = true;
        },
        stop: () => {},
        getStatus: () => (started ? 'connected' : 'idle'),
        getProviderId: () => 'claude',
        getProviderLabel: () => 'Claude CLI',
        write: async () => {},
      } as any,
      { getManifest: () => ({ tools: [] }) } as any,
      {} as any,
      { buildHandshakePrompt: () => 'handshake' } as any,
    );

    const output = await service.cmdBridge(['claude'], process.cwd());

    assert.equal(started, true);
    assert.match(output, /Claude CLI bridge connected/);
    assert.match(stripAnsi(output), /Status\s+connected/);
  });

  test('starts other provider bridges from /bridge provider', async () => {
    let provider = 'claude';
    const service = new BridgeCommandsService(
      {
        setAdapter: (adapter: any) => {
          provider = adapter.id;
        },
        start: async () => {},
        stop: () => {},
        getStatus: () => 'connected',
        getProviderId: () => provider,
        getProviderLabel: () => (provider === 'qwen' ? 'Qwen CLI' : 'Claude CLI'),
        write: async () => {},
      } as any,
      { getManifest: () => ({ tools: [] }) } as any,
      {} as any,
      {} as any,
    );

    const output = await service.cmdBridge(['qwen'], process.cwd());

    assert.equal(provider, 'qwen');
    assert.match(output, /Qwen CLI bridge connected/);
  });

  test('disconnects active bridge from /bridge stop', async () => {
    let stopped = false;
    let status = 'connected';
    const service = new BridgeCommandsService(
      {
        setAdapter: () => {},
        start: async () => {},
        stop: () => {
          stopped = true;
          status = 'disconnected';
        },
        getStatus: () => status,
        getProviderId: () => 'claude',
        getProviderLabel: () => 'Claude CLI',
        write: async () => {},
      } as any,
      { getManifest: () => ({ tools: [] }) } as any,
      {} as any,
      {} as any,
    );

    const output = await service.cmdBridge(['stop'], process.cwd());

    assert.equal(stopped, true);
    assert.match(output, /Bridge disconnected\. Cast runtime restored\./);
    assert.match(stripAnsi(output), /Status\s+disconnected/);
  });
});
