import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BridgeCommandsService } from '../../bridge/commands/bridge-commands.service';
import { createBridgeProviderAdapter } from '../../bridge/providers/claude-bridge-adapter';
import { BridgeRuntimeService } from '../../bridge/services/bridge-runtime.service';
import { BridgeSessionService } from '../../bridge/services/bridge-session.service';
import { FilesystemToolsService } from '../../tools/services/filesystem-tools.service';
import { ShellToolsService } from '../../tools/services/shell-tools.service';
import type { BridgeProviderId } from '../../bridge/types/bridge.types';
import type { SwarmGlobalConstraints, SwarmRuntimePolicy, SwarmWorkerRunInput } from '../types';

const BRIDGE_CONCURRENCY: Partial<Record<BridgeProviderId, number>> = {
  codex: 2,
  claude: 1,
  copilot: 1,
  qwen: 1,
  kimi: 1,
  openrouter: 2,
};

type SessionLease = {
  session: BridgeSessionService;
  inUse: boolean;
};

@Injectable()
export class SwarmBridgeRuntimeService {
  private readonly isolatedPool = new Map<BridgeProviderId, SessionLease[]>();
  private mainSessionTail: Promise<void> = Promise.resolve();
  private toolRootTail: Promise<void> = Promise.resolve();

  constructor(
    @Optional() private readonly bridgeCommands?: BridgeCommandsService,
    @Optional() private readonly bridgeSession?: BridgeSessionService,
    @Optional() private readonly bridgeRuntime?: BridgeRuntimeService,
    @Optional() private readonly filesystemTools?: FilesystemToolsService,
    @Optional() private readonly shellTools?: ShellToolsService,
  ) {}

  resolveDefaultPolicy(): SwarmRuntimePolicy {
    if (!this.isBridgeActive()) {
      return { kind: 'default' };
    }

    const provider = this.getActiveProvider();
    if (!provider) {
      return { kind: 'default' };
    }

    return {
      kind: 'bridge',
      provider,
      maxConcurrentSessions: BRIDGE_CONCURRENCY[provider] ?? 1,
    };
  }

  applyPolicyToConstraints(
    policy: SwarmRuntimePolicy,
    constraints: SwarmGlobalConstraints,
  ): SwarmGlobalConstraints {
    if (policy.kind === 'bridge') {
      return {
        ...constraints,
        maxWorkers: Math.min(constraints.maxWorkers, policy.maxConcurrentSessions),
      };
    }
    return constraints;
  }

  isBridgeActive(): boolean {
    return Boolean(this.bridgeCommands?.isConnected?.());
  }

  getActiveProvider(): BridgeProviderId | null {
    try {
      return this.bridgeSession?.getProviderId?.() ?? null;
    } catch {
      return null;
    }
  }

  formatPolicyLabel(policy: SwarmRuntimePolicy): string {
    if (policy.kind === 'default') return 'default (Cast API runtime)';
    if (policy.kind === 'bridge') {
      const mode = policy.maxConcurrentSessions <= 1
        ? 'serialized on active /bridge session'
        : `up to ${policy.maxConcurrentSessions} isolated bridge sessions`;
      return `bridge:${policy.provider} (${mode})`;
    }
    return `model:${policy.provider}/${policy.model}`;
  }

  async runWorker(input: SwarmWorkerRunInput): Promise<string> {
    const policy = input.plan.runtimePolicy;
    if (policy.kind !== 'bridge') {
      throw new Error('SwarmBridgeRuntimeService.runWorker requires bridge runtime policy.');
    }
    if (!this.isBridgeActive()) {
      throw new Error('Bridge is not connected. Run /bridge <provider> before executing a bridge-backed swarm.');
    }
    if (!this.bridgeRuntime) {
      throw new Error('BridgeRuntimeService is not available in this Nest context.');
    }

    const message = this.buildWorkerPrompt(input);
    const turnId = `swarm_${input.worktree.runId}_${input.planTask.id}_${randomUUID()}`;

    const execute = () => this.withToolRoots(input, async () => {
      const { session, release } = await this.acquireSession(policy.provider, policy);
      try {
        if (session.getStatus() !== 'connected') {
          await session.start({ cwd: input.worktree.worktreePath });
        }
        const result = await this.bridgeRuntime!.runUserTurnOnSession(
          session,
          { id: turnId, message },
          {
            projectRoot: input.worktree.worktreePath,
            onOutputChunk: input.onOutput,
          },
        );
        return result.output.trim();
      } finally {
        release();
      }
    });

    if (policy.maxConcurrentSessions <= 1) {
      const chained = this.mainSessionTail.then(() => execute());
      this.mainSessionTail = chained.then(() => undefined, () => undefined);
      return chained;
    }

    return execute();
  }

  private async withToolRoots<T>(input: SwarmWorkerRunInput, fn: () => Promise<T>): Promise<T> {
    if (!this.filesystemTools || !this.shellTools) {
      return fn();
    }

    const run = this.toolRootTail.then(async () => {
      this.filesystemTools!.setRootDir(input.worktree.worktreePath, input.worktree.workspaceRoot);
      this.shellTools!.setRootDir(input.worktree.worktreePath, input.worktree.workspaceRoot);
      return fn();
    });
    this.toolRootTail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async acquireSession(
    provider: BridgeProviderId,
    policy: SwarmRuntimePolicy & { kind: 'bridge' },
  ): Promise<{ session: BridgeSessionService; release: () => void }> {
    if (policy.maxConcurrentSessions <= 1) {
      if (!this.bridgeSession) {
        throw new Error('Bridge session is not available.');
      }
      return { session: this.bridgeSession, release: () => undefined };
    }

    const pool = this.isolatedPool.get(provider) ?? [];
    this.isolatedPool.set(provider, pool);

    let lease = pool.find((entry) => !entry.inUse);
    if (!lease && pool.length < policy.maxConcurrentSessions) {
      lease = { session: new BridgeSessionService(createBridgeProviderAdapter(provider)), inUse: false };
      pool.push(lease);
    }
    if (!lease) {
      await this.waitForAvailable(pool);
      lease = pool.find((entry) => !entry.inUse);
    }
    if (!lease) {
      throw new Error(`No bridge session available for provider ${provider}.`);
    }

    lease.inUse = true;
    return {
      session: lease.session,
      release: () => {
        lease!.inUse = false;
        if (lease!.session.getStatus() === 'connected') {
          lease!.session.stop();
        }
      },
    };
  }

  private waitForAvailable(pool: SessionLease[]): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (pool.some((entry) => !entry.inUse)) {
          resolve();
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  }

  private buildWorkerPrompt(input: SwarmWorkerRunInput): string {
    const ownership = input.planTask.fileOwnership.map((entry) => `- ${entry.glob}`).join('\n');
    const skills = [
      ...input.planTask.injectedSkills.map((name) => `injected:${name}`),
      ...input.planTask.discoverableSkills.map((name) => `discoverable:${name}`),
    ].join(', ');

    return [
      input.planTask.worker.systemPrompt,
      '',
      '# Swarm execution contract',
      `Task: ${input.planTask.title}`,
      input.planTask.description,
      `Worktree: ${input.worktree.worktreePath}`,
      `Branch: ${input.worktree.branchName}`,
      '',
      '# File ownership',
      ownership,
      '',
      skills ? `# Skills\n${skills}` : '',
      '',
      '# Rules',
      '- Use RELATIVE paths only.',
      '- Do not modify files outside ownership.',
      '- Cast executes all tools; do not call native provider tools.',
      '- When finished, return a concise summary of changes, decisions, and verification.',
    ].join('\n');
  }
}
