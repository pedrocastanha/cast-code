import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeCommandsService } from './bridge-commands.service';
import { stripAnsi } from '../../../ui/cast-design/cli-renderer';
import type { ChoiceOption } from '../../repl/services/smart-input';

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

  test('keeps bridge routing active when a one-shot provider process disconnects between turns', async () => {
    let provider = 'claude';
    let starts = 0;
    let prompt = '';
    const service = new BridgeCommandsService(
      {
        setAdapter: (adapter: any) => {
          provider = adapter.id;
        },
        start: async () => {
          starts += 1;
        },
        stop: () => {},
        getStatus: () => 'disconnected',
        getProviderId: () => provider,
        getProviderLabel: () => 'Claude CLI',
        write: async () => {},
      } as any,
      { getManifest: () => ({ tools: [] }) } as any,
      {
        runUserTurn: async (turn: { message: string }) => {
          prompt = turn.message;
          return { output: 'bridge answer' };
        },
      } as any,
      {} as any,
    );

    const output = await service.cmdBridge(['claude'], process.cwd());
    assert.equal(service.isConnected(), true);
    assert.match(stripAnsi(output), /Status\s+connected/);

    const answer = await service.runPrompt('qual modelo?', process.cwd());
    assert.equal(answer, 'bridge answer');
    assert.equal(prompt, 'qual modelo?');
    assert.equal(starts, 2, 'runPrompt should reopen the one-shot provider process');
  });

  test('opens provider picker for bare /bridge and starts selected provider', async () => {
    let provider = 'claude';
    let asked = false;
    const service = new BridgeCommandsService(
      {
        setAdapter: (adapter: any) => {
          provider = adapter.id;
        },
        start: async () => {},
        stop: () => {},
        getStatus: () => 'connected',
        getProviderId: () => provider,
        getProviderLabel: () => (provider === 'codex' ? 'Codex CLI' : 'Claude CLI'),
        write: async () => {},
      } as any,
      { getManifest: () => ({ tools: [] }) } as any,
      {} as any,
      {} as any,
    );

    const output = await service.cmdBridge([], process.cwd(), {
      askChoice: async (message: string, choices: ChoiceOption[]) => {
        asked = true;
        assert.equal(message, 'Bridge provider');
        assert.deepEqual(choices.map((choice) => choice.key), ['claude', 'codex', 'copilot', 'qwen', 'kimi', 'openrouter']);
        assert.equal(choices.every((choice) => choice.tabKey?.startsWith('autostart:')), true);
        return 'codex';
      },
    } as any);

    assert.equal(asked, true);
    assert.equal(provider, 'codex');
    assert.match(output, /Codex CLI bridge connected/);
  });

  test('tab action enables project autostart and connects selected provider', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'cast-bridge-'));
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

    const output = await service.cmdBridge([], projectRoot, {
      askChoice: async () => 'autostart:qwen',
    } as any);

    const settings = JSON.parse(await readFile(join(projectRoot, '.cast', 'bridge.json'), 'utf-8'));
    assert.deepEqual(settings, { autostart: { enabled: true, provider: 'qwen' } });
    assert.equal(provider, 'qwen');
    assert.match(output, /Autostart enabled/);
    assert.match(stripAnsi(output), /Autostart\s+Qwen CLI/);
  });

  test('starts configured autostart provider', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'cast-bridge-'));
    const service = new BridgeCommandsService(
      {
        setAdapter: (adapter: any) => {
          assert.equal(adapter.id, 'kimi');
        },
        start: async () => {},
        stop: () => {},
        getStatus: () => 'connected',
        getProviderId: () => 'kimi',
        getProviderLabel: () => 'Kimi CLI',
        write: async () => {},
      } as any,
      { getManifest: () => ({ tools: [] }) } as any,
      {} as any,
      {} as any,
    );

    await service.cmdBridge(['autostart', 'kimi'], projectRoot);
    const output = await service.startAutostart(projectRoot);

    assert.match(output || '', /Kimi CLI bridge autostarted/);
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
