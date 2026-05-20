import { Injectable, OnApplicationShutdown, Optional } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { spawn as spawnProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { ClaudeBridgeAdapter } from '../providers/claude-bridge-adapter';
import type { BridgeProviderAdapter } from '../providers/bridge-provider.types';
import type { BridgeProviderId, BridgeSessionStatus } from '../types/bridge.types';

export interface BridgePty {
  write(value: string): void | Promise<void>;
  endInput?(): void;
  kill(): void;
  resize?(cols: number, rows: number): void;
  onData?(listener: (chunk: string) => void): void;
  onExit?(listener: () => void): void;
  on?(event: 'data', listener: (chunk: string) => void): unknown;
  on?(event: 'exit', listener: () => void): unknown;
}

export interface BridgePtyFactory {
  spawn(
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number },
  ): BridgePty;
}

class ChildProcessPty implements BridgePty {
  constructor(private readonly child: ChildProcessWithoutNullStreams) {}

  write(value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => this.child.stdin.off('error', onError);
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      this.child.stdin.once('error', onError);
      this.child.stdin.write(value, (error) => {
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  kill(): void {
    this.child.kill();
  }

  endInput(): void {
    this.child.stdin.end();
  }

  onData(listener: (chunk: string) => void): void {
    this.child.stdout.on('data', (chunk) => listener(String(chunk)));
    this.child.stderr.on('data', (chunk) => listener(String(chunk)));
  }

  onExit(listener: () => void): void {
    this.child.on('exit', listener);
  }
}

class NodePtyFactory implements BridgePtyFactory {
  spawn(
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number },
  ): BridgePty {
    if (options.env.CAST_BRIDGE_DISABLE_PTY === '1') {
      return this.spawnChildProcess(command, args, options);
    }

    try {
      const pty = require('node-pty') as {
        spawn(
          command: string,
          args: string[],
          options: {
            name: string;
            cwd: string;
            env: NodeJS.ProcessEnv;
            cols: number;
            rows: number;
          },
        ): BridgePty;
      };

      return pty.spawn(command, args, {
        name: 'xterm-256color',
        cwd: options.cwd,
        env: options.env,
        cols: options.cols,
        rows: options.rows,
      });
    } catch {
      return this.spawnChildProcess(command, args, options);
    }
  }

  private spawnChildProcess(
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ): BridgePty {
    return new ChildProcessPty(
      spawnProcess(command, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
      }),
    );
  }
}

@Injectable()
export class BridgeSessionService implements OnApplicationShutdown {
  private pty: BridgePty | null = null;
  private status: BridgeSessionStatus = 'idle';
  private readonly events = new EventEmitter();

  constructor(
    @Optional() private adapter: BridgeProviderAdapter = new ClaudeBridgeAdapter(),
    @Optional() private readonly ptyFactory: BridgePtyFactory = new NodePtyFactory(),
  ) {}

  setAdapter(adapter: BridgeProviderAdapter): void {
    if (this.pty && this.adapter.id !== adapter.id) {
      this.stop();
    }
    this.adapter = adapter;
  }

  async start(options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<void> {
    if (this.pty) {
      this.stop();
    }

    this.status = 'starting';
    this.adapter.resetOutput?.();
    const command = this.adapter.defaultCommand();
    const args = this.adapter.defaultArgs();
    const env = { ...process.env, ...(options.env || {}) };
    if (args.includes('stream-json') || args.includes('--json')) {
      env.CAST_BRIDGE_DISABLE_PTY ??= '1';
    }

    this.pty = this.ptyFactory.spawn(command, args, {
      cwd: options.cwd,
      env,
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 30,
    });

    this.attachDataListener(this.pty);
    this.attachExitListener(this.pty);
    this.status = 'connected';
  }

  async write(value: string): Promise<void> {
    if (!this.pty) {
      throw new Error('Bridge provider session is not connected.');
    }

    const formatted = this.adapter.formatInput?.(value) ?? value;
    await this.pty.write(formatted.endsWith('\n') ? formatted : `${formatted}\n`);
    if (this.adapter.closeInputAfterWrite?.()) {
      this.pty.endInput?.();
    }
  }

  onData(listener: (chunk: string) => void): () => void {
    this.events.on('data', listener);
    return () => this.events.off('data', listener);
  }

  onceExit(listener: () => void): void {
    this.events.once('exit', listener);
  }

  getStatus(): BridgeSessionStatus {
    return this.status;
  }

  getProviderId(): BridgeProviderId {
    return this.adapter.id;
  }

  getProviderLabel(): string {
    return this.adapter.label;
  }

  requiresToolResultFollowup(): boolean {
    return this.adapter.requiresToolResultFollowup?.() ?? false;
  }

  stop(): void {
    if (this.pty) {
      this.pty.kill();
      this.pty = null;
    }
    this.status = 'disconnected';
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  private attachDataListener(pty: BridgePty): void {
    const listener = (chunk: string) => {
      this.events.emit('data', this.adapter.sanitizeOutput(String(chunk)));
    };

    if (typeof pty.onData === 'function') {
      pty.onData(listener);
      return;
    }

    pty.on?.('data', listener);
  }

  private attachExitListener(pty: BridgePty): void {
    const listener = () => {
      this.status = 'disconnected';
      this.events.emit('exit');
    };

    if (typeof pty.onExit === 'function') {
      pty.onExit(listener);
      return;
    }

    pty.on?.('exit', listener);
  }
}
