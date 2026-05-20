import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CommandUiService } from '../../repl/services/command-ui.service';
import { BridgeSessionService } from '../services/bridge-session.service';
import { BridgeToolExecutorService } from '../services/bridge-tool-executor.service';
import { BridgeRuntimeService } from '../services/bridge-runtime.service';
import { BridgeProtocolService } from '../services/bridge-protocol.service';
import {
  createBridgeProviderAdapter,
  formatBridgeProviderList,
  isBridgeProviderId,
} from '../providers/claude-bridge-adapter';
import type { BridgeProviderId } from '../types/bridge.types';
import type { BridgeRuntimeCallbacks } from '../types/bridge.types';

type BridgeRow = { label: string; value: string };

@Injectable()
export class BridgeCommandsService {
  private rawOutput = false;

  constructor(
    private readonly session: BridgeSessionService,
    private readonly executor: BridgeToolExecutorService,
    private readonly runtime: BridgeRuntimeService,
    private readonly protocol: BridgeProtocolService,
  ) {}

  private readonly ui = new CommandUiService();

  async startProvider(provider: BridgeProviderId, projectRoot: string): Promise<void> {
    this.session.setAdapter(createBridgeProviderAdapter(provider));
    await this.session.start({ cwd: projectRoot });
  }

  async startClaude(projectRoot: string): Promise<void> {
    await this.startProvider('claude', projectRoot);
  }

  isConnected(): boolean {
    return this.session.getStatus() === 'connected';
  }

  getProviderLabel(): string {
    return this.session.getProviderLabel();
  }

  async runPrompt(message: string, projectRoot: string, callbacks: BridgeRuntimeCallbacks = {}): Promise<string> {
    if (this.session.getStatus() !== 'connected') {
      await this.startProvider(this.session.getProviderId(), projectRoot);
    }

    const result = await this.runtime.runUserTurn(
      { id: `turn_${randomUUID()}`, message },
      { projectRoot, ...callbacks },
    );
    return result.output;
  }

  async cmdBridge(args: string[], projectRoot: string): Promise<string> {
    const subcommand = (args[0] || 'status').toLowerCase();

    if (isBridgeProviderId(subcommand)) {
      await this.startProvider(subcommand, projectRoot);
      return this.getStatusPanel(`${this.session.getProviderLabel()} bridge connected.`);
    }

    if (subcommand === 'start' || subcommand === 'connect') {
      const requestedProvider = args[1]?.toLowerCase();
      const provider = isBridgeProviderId(requestedProvider)
        ? requestedProvider
        : this.session.getProviderId();
      await this.startProvider(provider, projectRoot);
      return this.getStatusPanel(`${this.session.getProviderLabel()} bridge connected.`);
    }

    if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
      return this.getUsagePanel('Bridge swaps the model CLI; Cast keeps tools.');
    }

    if (subcommand === 'status') {
      return this.getStatusPanel();
    }

    if (subcommand === 'stop' || subcommand === 'disconnect' || subcommand === 'off') {
      this.session.stop();
      return this.getStatusPanel('Bridge disconnected. Cast runtime restored.');
    }

    if (subcommand === 'reset') {
      this.session.stop();
      await this.startProvider(this.session.getProviderId(), projectRoot);
      return this.getStatusPanel('Bridge reset complete.');
    }

    if (subcommand === 'raw') {
      const mode = (args[1] || '').toLowerCase();
      if (mode !== 'on' && mode !== 'off') {
        return this.getUsagePanel('Usage: /bridge raw on | raw off');
      }
      this.rawOutput = mode === 'on';
      return this.getStatusPanel(`Raw bridge output: ${this.rawOutput ? 'on' : 'off'}.`);
    }

    if (subcommand === 'tools') {
      const tools = this.executor.getManifest().tools;
      if (tools.length === 0) {
        return this.renderPanel({
          title: 'Bridge Tools',
          lines: ['No bridge tools are available.'],
          footer: `/bridge ${this.session.getProviderId()} starts the current provider bridge.`,
        });
      }
      return this.renderPanel({
        title: 'Bridge Tools',
        lines: tools.map((tool) => `${tool.name}: ${tool.description}`),
        footer: `${tools.length} tools exposed through Cast guards.`,
      });
    }

    return this.getUsagePanel(`Unknown bridge command: ${subcommand}`);
  }

  getStatusPanel(message?: string): string {
    const lines = message ? [message] : [];
    return this.renderPanel({
      title: 'Bridge Status',
      rows: [
        { label: 'Provider', value: this.session.getProviderLabel() },
        { label: 'Status', value: this.session.getStatus() },
        { label: 'Tools', value: String(this.executor.getManifest().tools.length) },
        { label: 'Raw output', value: this.rawOutput ? 'on' : 'off' },
      ],
      lines,
      footer: '/bridge <provider> | status | stop | reset | raw on|off | tools',
    });
  }

  private getUsagePanel(message: string): string {
    return this.renderPanel({
      title: 'Bridge',
      lines: [
        message,
        `Providers: ${formatBridgeProviderList().replace(/\|/g, ', ')}`,
        '/bridge <provider>: Start a provider CLI bridge',
        '/bridge status: Show current provider status',
        '/bridge stop: Disconnect bridge and restore normal Cast runtime',
        '/bridge reset: Restart current provider session',
        '/bridge raw on: Show raw provider diagnostics',
        '/bridge tools: List Cast tools exposed to provider',
      ],
    });
  }

  private renderPanel(input: {
    title: string;
    rows?: BridgeRow[];
    lines?: string[];
    footer?: string;
  }): string {
    return this.ui.panel({
      title: input.title,
      sections: [
        ...(input.rows?.length ? [{ rows: input.rows }] : []),
        ...(input.lines?.length ? [{ lines: input.lines }] : []),
      ],
      footer: input.footer,
    });
  }
}
