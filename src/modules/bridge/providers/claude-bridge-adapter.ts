import { BridgeProtocolService } from '../services/bridge-protocol.service';
import {
  BRIDGE_PROVIDER_IDS,
  type BridgeProviderId,
  type BridgeToolManifest,
  type BridgeUserTurn,
} from '../types/bridge.types';
import type { BridgeProviderAdapter, BridgeStartupFailure } from './bridge-provider.types';

interface BridgeProviderConfig {
  id: BridgeProviderId;
  label: string;
  command: string;
  envName: string;
}

const PROVIDER_CONFIGS: Record<BridgeProviderId, BridgeProviderConfig> = {
  claude: {
    id: 'claude',
    label: 'Claude CLI',
    command: 'claude',
    envName: 'CLAUDE',
  },
  codex: {
    id: 'codex',
    label: 'Codex CLI',
    command: 'codex',
    envName: 'CODEX',
  },
  copilot: {
    id: 'copilot',
    label: 'Copilot CLI',
    command: 'copilot',
    envName: 'COPILOT',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen CLI',
    command: 'qwen',
    envName: 'QWEN',
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi CLI',
    command: 'kimi',
    envName: 'KIMI',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter CLI',
    command: 'openrouter',
    envName: 'OPENROUTER',
  },
};

export function isBridgeProviderId(value: string | undefined): value is BridgeProviderId {
  return Boolean(value && (BRIDGE_PROVIDER_IDS as readonly string[]).includes(value));
}

export function formatBridgeProviderList(): string {
  return BRIDGE_PROVIDER_IDS.join('|');
}

export function createBridgeProviderAdapter(
  provider: BridgeProviderId,
  env: NodeJS.ProcessEnv = process.env,
): BridgeProviderAdapter {
  return new CliBridgeAdapter(provider, env);
}

export class CliBridgeAdapter implements BridgeProviderAdapter {
  readonly id: BridgeProviderId;
  readonly label: string;
  private readonly protocol = new BridgeProtocolService();
  private outputBuffer = '';
  private emittedAssistantText = false;
  private readonly config: BridgeProviderConfig;

  constructor(provider: BridgeProviderId = 'claude', private readonly env: NodeJS.ProcessEnv = process.env) {
    this.config = PROVIDER_CONFIGS[provider];
    this.id = this.config.id;
    this.label = this.config.label;
  }

  defaultCommand(): string {
    return this.env[this.envKey('COMMAND')] || this.config.command;
  }

  defaultArgs(): string[] {
    const raw = this.env[this.envKey('ARGS')] || '';
    if (raw.trim()) {
      return raw.trim().split(/\s+/);
    }

    if (this.usesCodexJson()) {
      const args = [
        'exec',
        '--ignore-user-config',
        '--ignore-rules',
        '--json',
        '--color',
        'never',
        '--sandbox',
        'read-only',
        '--skip-git-repo-check',
      ];
      const model = this.env[this.envKey('MODEL')];
      if (model) {
        args.push('--model', model);
      }
      args.push('-');
      return args;
    }

    if (!this.usesStreamJson()) {
      return [];
    }

    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--tools',
      '',
    ];
    const model = this.env[this.envKey('MODEL')] || 'sonnet';
    if (model) {
      args.push('--model', model);
    }
    const maxBudgetUsd = this.env[this.envKey('MAX_BUDGET_USD')];
    if (maxBudgetUsd) {
      args.push('--max-budget-usd', maxBudgetUsd);
    }
    return args;
  }

  resetOutput(): void {
    this.outputBuffer = '';
    this.emittedAssistantText = false;
  }

  formatInput(value: string): string {
    if (!this.usesStreamJson()) {
      return value;
    }

    return JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: value }],
      },
    });
  }

  closeInputAfterWrite(): boolean {
    return this.usesCodexJson();
  }

  requiresToolResultFollowup(): boolean {
    const override = this.env[this.envKey('ONE_SHOT')];
    if (override === '1') {
      return true;
    }
    if (override === '0') {
      return false;
    }
    return (this.id === 'claude' && this.usesStreamJson()) || this.usesCodexJson();
  }

  buildHandshakePrompt(manifest: BridgeToolManifest): string {
    return this.protocol.buildHandshakePrompt(manifest, this.id, this.label);
  }

  buildUserTurn(input: BridgeUserTurn): string {
    return this.protocol.buildUserTurn(input);
  }

  sanitizeOutput(chunk: string): string {
    const clean = chunk.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
    if (!this.usesStreamJson() && !this.usesCodexJson()) {
      return clean;
    }

    this.outputBuffer += clean;
    const lines = this.outputBuffer.split(/\r?\n/);
    this.outputBuffer = lines.pop() || '';

    return lines
      .map((line) => this.usesCodexJson()
        ? this.extractCodexJsonText(line)
        : this.extractStreamJsonText(line))
      .filter(Boolean)
      .join('\n');
  }

  classifyStartupFailure(output: string): BridgeStartupFailure | null {
    if (/not found|ENOENT|command not found/i.test(output)) {
      return { kind: 'missing_command', message: `${this.label} was not found on PATH.` };
    }

    if (/login|log in|authenticated|auth/i.test(output)) {
      return { kind: 'auth_required', message: `${this.label} is not authenticated.` };
    }

    return null;
  }

  private usesStreamJson(): boolean {
    if (this.id !== 'claude') {
      return false;
    }

    if (this.env[this.envKey('STREAM_JSON')] === '1') {
      return true;
    }
    if (this.env[this.envKey('STREAM_JSON')] === '0') {
      return false;
    }
    return !this.env[this.envKey('COMMAND')] && !this.env[this.envKey('ARGS')];
  }

  private usesCodexJson(): boolean {
    if (this.id !== 'codex') {
      return false;
    }

    if (this.env[this.envKey('JSON')] === '1') {
      return true;
    }
    if (this.env[this.envKey('JSON')] === '0') {
      return false;
    }
    return !this.env[this.envKey('COMMAND')] && !this.env[this.envKey('ARGS')];
  }

  private envKey(suffix: string): string {
    return `CAST_BRIDGE_${this.config.envName}_${suffix}`;
  }

  private extractStreamJsonText(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const event = JSON.parse(trimmed) as {
        type?: string;
        subtype?: string;
        result?: string;
        message?: {
          content?: Array<{ type?: string; text?: string }>;
        };
        error?: string;
      };

      if (event.type === 'assistant') {
        const text = (event.message?.content || [])
          .filter((part) => part.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('');
        if (text) {
          this.emittedAssistantText = true;
        }
        return text;
      }

      if (
        event.type === 'result'
        && typeof event.result === 'string'
        && event.result
        && !this.emittedAssistantText
      ) {
        return event.result;
      }

      if (event.type === 'system' && event.subtype === 'error') {
        return event.error || '';
      }

      return '';
    } catch {
      return trimmed;
    }
  }

  private extractCodexJsonText(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) {
      return '';
    }

    if (
      /^Reading additional input from stdin/i.test(trimmed)
      || /^WARNING: proceeding/i.test(trimmed)
    ) {
      return '';
    }

    try {
      const event = JSON.parse(trimmed) as {
        type?: string;
        message?: string;
        item?: {
          type?: string;
          text?: string;
          aggregated_output?: string;
          status?: string;
        };
      };

      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        return event.item.text || '';
      }

      if (event.type === 'error' && typeof event.message === 'string') {
        return event.message;
      }

      return '';
    } catch {
      return '';
    }
  }
}

export class ClaudeBridgeAdapter extends CliBridgeAdapter {
  constructor(env: NodeJS.ProcessEnv = process.env) {
    super('claude', env);
  }
}
