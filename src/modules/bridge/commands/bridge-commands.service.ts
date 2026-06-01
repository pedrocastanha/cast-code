import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CommandUiService } from '../../repl/services/command-ui.service';
import type { ISmartInput } from '../../repl/services/smart-input';
import { BridgeSessionService } from '../services/bridge-session.service';
import { BridgeToolExecutorService } from '../services/bridge-tool-executor.service';
import { BridgeRuntimeService } from '../services/bridge-runtime.service';
import {
  createBridgeProviderAdapter,
  formatBridgeProviderList,
  isBridgeProviderId,
} from '../providers/claude-bridge-adapter';
import { BRIDGE_PROVIDER_IDS, type BridgeProviderId } from '../types/bridge.types';
import type { BridgeRuntimeCallbacks } from '../types/bridge.types';

type BridgeRow = { label: string; value: string };
type BridgeSettings = {
  autostart?: {
    enabled?: boolean;
    provider?: BridgeProviderId;
  };
};

@Injectable()
export class BridgeCommandsService {
  private rawOutput = false;
  private bridgeActive = false;

  constructor(
    private readonly session: BridgeSessionService,
    private readonly executor: BridgeToolExecutorService,
    private readonly runtime: BridgeRuntimeService,
  ) {}

  private readonly ui = new CommandUiService();

  async startProvider(provider: BridgeProviderId, projectRoot: string): Promise<void> {
    this.session.setAdapter(createBridgeProviderAdapter(provider));
    await this.session.start({ cwd: projectRoot });
    this.bridgeActive = true;
  }

  async startClaude(projectRoot: string): Promise<void> {
    await this.startProvider('claude', projectRoot);
  }

  isConnected(): boolean {
    return this.bridgeActive;
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

  async cmdBridge(args: string[], projectRoot: string, smartInput?: ISmartInput): Promise<string> {
    const subcommand = (args[0] || 'status').toLowerCase();

    if (args.length === 0 && smartInput) {
      return this.showProviderMenu(projectRoot, smartInput);
    }

    if (isBridgeProviderId(subcommand)) {
      await this.startProvider(subcommand, projectRoot);
      return this.getStatusPanel(`${this.session.getProviderLabel()} bridge connected.`, await this.getAutostartLabel(projectRoot));
    }

    if (subcommand === 'start' || subcommand === 'connect') {
      const requestedProvider = args[1]?.toLowerCase();
      const provider = isBridgeProviderId(requestedProvider)
        ? requestedProvider
        : this.session.getProviderId();
      await this.startProvider(provider, projectRoot);
      return this.getStatusPanel(`${this.session.getProviderLabel()} bridge connected.`, await this.getAutostartLabel(projectRoot));
    }

    if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
      return this.getUsagePanel('Bridge swaps the model CLI; Cast keeps tools.');
    }

    if (subcommand === 'status') {
      return this.getStatusPanel(undefined, await this.getAutostartLabel(projectRoot));
    }

    if (subcommand === 'stop' || subcommand === 'disconnect' || subcommand === 'off') {
      this.session.stop();
      this.bridgeActive = false;
      await this.writeSettings(projectRoot, { autostart: { enabled: false } });
      return this.getStatusPanel('Bridge disconnected. Cast runtime restored.', await this.getAutostartLabel(projectRoot));
    }

    if (subcommand === 'reset') {
      this.session.stop();
      await this.startProvider(this.session.getProviderId(), projectRoot);
      return this.getStatusPanel('Bridge reset complete.', await this.getAutostartLabel(projectRoot));
    }

    if (subcommand === 'autostart') {
      return this.handleAutostartCommand(args.slice(1), projectRoot);
    }

    if (subcommand === 'raw') {
      const mode = (args[1] || '').toLowerCase();
      if (mode !== 'on' && mode !== 'off') {
        return this.getUsagePanel('Usage: /bridge raw on | raw off');
      }
      this.rawOutput = mode === 'on';
      return this.getStatusPanel(`Raw bridge output: ${this.rawOutput ? 'on' : 'off'}.`, await this.getAutostartLabel(projectRoot));
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

  async startAutostart(projectRoot: string): Promise<string | null> {
    const provider = await this.getAutostartProvider(projectRoot);
    if (!provider) {
      return null;
    }

    await this.startProvider(provider, projectRoot);
    return null;
  }

  getStatusPanel(message?: string, autostartLabel = 'off'): string {
    const lines = message ? [message] : [];
    return this.renderPanel({
      title: 'Bridge Status',
      rows: [
        { label: 'Provider', value: this.session.getProviderLabel() },
        { label: 'Status', value: this.getBridgeStatusLabel() },
        { label: 'Autostart', value: autostartLabel },
        { label: 'Tools', value: String(this.executor.getManifest().tools.length) },
        { label: 'Raw output', value: this.rawOutput ? 'on' : 'off' },
      ],
      lines,
      footer: '/bridge <provider> | status | stop | reset | autostart on|off | raw on|off | tools',
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
        '/bridge autostart <provider>|off: Persist provider autostart for this project',
        '/bridge raw on: Show raw provider diagnostics',
        '/bridge tools: List Cast tools exposed to provider',
      ],
    });
  }

  private async showProviderMenu(projectRoot: string, smartInput: ISmartInput): Promise<string> {
    const settings = await this.readSettings(projectRoot);
    const autostartProvider = settings.autostart?.enabled ? settings.autostart.provider : undefined;
    const activeProvider = this.bridgeActive ? this.session.getProviderId() : undefined;

    const providerChoices = BRIDGE_PROVIDER_IDS.map((provider) => {
      const adapter = createBridgeProviderAdapter(provider);
      const notes = [
        activeProvider === provider ? 'connected' : '',
        autostartProvider === provider ? 'autostart' : '',
        `command: ${adapter.defaultCommand()}`,
      ].filter(Boolean);
      return {
        key: provider,
        label: adapter.label,
        description: notes.join(' · '),
        tabKey: `autostart:${provider}`,
        tabLabel: 'connect + autostart',
      };
    });

    const selected = await smartInput.askChoice('Bridge provider', [
      ...providerChoices,
      {
        key: 'stop',
        label: 'Stop bridge',
        description: this.bridgeActive
          ? 'restore Cast API-key runtime'
          : 'Cast API-key runtime already active',
      },
    ]);

    if (!selected) {
      return this.getStatusPanel('Bridge selection cancelled.', await this.getAutostartLabel(projectRoot));
    }

    if (selected.startsWith('autostart:')) {
      const provider = selected.slice('autostart:'.length);
      if (!isBridgeProviderId(provider)) {
        return this.getUsagePanel(`Unknown bridge provider: ${provider}`);
      }
      await this.startProvider(provider, projectRoot);
      await this.writeSettings(projectRoot, { autostart: { enabled: true, provider } });
      return this.getStatusPanel(`${this.session.getProviderLabel()} bridge connected. Autostart enabled for this project.`, await this.getAutostartLabel(projectRoot));
    }

    if (selected === 'stop') {
      this.session.stop();
      this.bridgeActive = false;
      await this.writeSettings(projectRoot, { autostart: { enabled: false } });
      return this.getStatusPanel('Bridge disconnected. Cast runtime restored.', await this.getAutostartLabel(projectRoot));
    }

    if (!isBridgeProviderId(selected)) {
      return this.getUsagePanel(`Unknown bridge provider: ${selected}`);
    }

    await this.startProvider(selected, projectRoot);
    return this.getStatusPanel(`${this.session.getProviderLabel()} bridge connected.`, await this.getAutostartLabel(projectRoot));
  }

  private async handleAutostartCommand(args: string[], projectRoot: string): Promise<string> {
    const requested = (args[0] || 'status').toLowerCase();
    if (requested === 'status') {
      return this.getStatusPanel(undefined, await this.getAutostartLabel(projectRoot));
    }

    if (requested === 'off' || requested === 'disable' || requested === 'stop') {
      await this.writeSettings(projectRoot, { autostart: { enabled: false } });
      return this.getStatusPanel('Bridge autostart disabled for this project.', await this.getAutostartLabel(projectRoot));
    }

    const provider = requested === 'on' ? this.session.getProviderId() : requested;
    if (!isBridgeProviderId(provider)) {
      return this.getUsagePanel('Usage: /bridge autostart <provider> | on | off');
    }

    await this.writeSettings(projectRoot, { autostart: { enabled: true, provider } });
    return this.getStatusPanel(`${createBridgeProviderAdapter(provider).label} autostart enabled for this project.`, await this.getAutostartLabel(projectRoot));
  }

  private async getAutostartProvider(projectRoot: string): Promise<BridgeProviderId | null> {
    const settings = await this.readSettings(projectRoot);
    const provider = settings.autostart?.provider;
    if (settings.autostart?.enabled && isBridgeProviderId(provider)) {
      return provider;
    }
    return null;
  }

  private async getAutostartLabel(projectRoot: string): Promise<string> {
    const provider = await this.getAutostartProvider(projectRoot);
    return provider ? createBridgeProviderAdapter(provider).label : 'off';
  }

  private async readSettings(projectRoot: string): Promise<BridgeSettings> {
    try {
      const raw = await fs.readFile(this.getSettingsPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw) as BridgeSettings;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {};
      }
      return {};
    }
  }

  private async writeSettings(projectRoot: string, settings: BridgeSettings): Promise<void> {
    const settingsPath = this.getSettingsPath(projectRoot);
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
  }

  private getSettingsPath(projectRoot: string): string {
    return path.join(projectRoot, '.cast', 'bridge.json');
  }

  private getBridgeStatusLabel(): string {
    if (this.bridgeActive) {
      return 'connected';
    }
    return this.session.getStatus();
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
