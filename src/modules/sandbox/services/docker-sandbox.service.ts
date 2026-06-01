import { Injectable, Optional } from '@nestjs/common';
import { StateRedactionService } from '../../state/services/state-redaction.service';
import type { SandboxBackend, SandboxContext, SandboxRunOptions } from '../types';
import { SandboxCommandRunnerService } from './sandbox-command-runner.service';

@Injectable()
export class DockerSandboxService implements SandboxBackend {
  readonly mode = 'docker' as const;

  constructor(
    private readonly commands: SandboxCommandRunnerService,
    @Optional()
    private readonly redaction?: StateRedactionService,
  ) {}

  async isAvailable(): Promise<boolean> {
    const result = await this.commands.run('docker', ['version', '--format', '{{.Server.Version}}']);
    return result.exitCode === 0;
  }

  async prepare(options: SandboxRunOptions): Promise<SandboxContext> {
    if (!await this.isAvailable()) {
      throw new Error('Docker sandbox requested but Docker is not available.');
    }

    const network = options.config?.allowNetwork || options.config?.docker?.network
      ? options.config?.docker?.network ?? 'bridge'
      : 'none';
    const image = options.config?.docker?.image ?? 'node:20';
    const readWrite = options.config?.docker?.readWrite === true;
    const env = this.allowedEnv(options.config?.docker?.envAllowlist ?? []);
    return {
      mode: 'docker',
      requestedMode: options.requestedMode ?? 'docker',
      runId: options.runId,
      projectRoot: options.projectRoot,
      root: options.projectRoot,
      artifactDir: options.artifactDir,
      docker: { image, network, readWrite, env },
      commandLog: [
        ...(options.fallbackReason ? [options.fallbackReason] : []),
        `docker available; image=${image} network=${network} mount=${readWrite ? 'read-write' : 'read-only'} env=${Object.keys(env).sort().join(',') || 'none'}`,
      ],
    };
  }

  async runCommand(
    context: SandboxContext,
    command: string,
    args: string[] = [],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const dockerArgs = this.buildDockerArgs(context, command, args);
    context.commandLog.push(`docker ${dockerArgs.map((arg) => this.logArg(arg)).join(' ')}`);
    const result = await this.commands.run('docker', dockerArgs);
    context.commandLog.push(`docker exit ${result.exitCode}`);
    if (result.stdout.trim()) {
      context.commandLog.push(`stdout: ${this.preview(result.stdout)}`);
    }
    if (result.stderr.trim()) {
      context.commandLog.push(`stderr: ${this.preview(result.stderr)}`);
    }
    return result;
  }

  async capture(): Promise<Record<string, never>> {
    return {};
  }

  async dispose(): Promise<void> {
    return undefined;
  }

  private buildDockerArgs(context: SandboxContext, command: string, args: string[]): string[] {
    const docker = context.docker ?? {
      image: 'node:20',
      network: 'none' as const,
      readWrite: false,
      env: {},
    };
    const mount = [
      'type=bind',
      `src=${context.projectRoot}`,
      'dst=/workspace',
      docker.readWrite ? undefined : 'readonly',
    ].filter(Boolean).join(',');
    const dockerArgs = [
      'run',
      '--rm',
      '--network',
      docker.network,
      '--mount',
      mount,
      '-w',
      '/workspace',
    ];
    for (const key of Object.keys(docker.env).sort()) {
      dockerArgs.push('-e', key);
    }
    dockerArgs.push(docker.image, command, ...args);
    return dockerArgs;
  }

  private allowedEnv(keys: string[]): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of keys) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        continue;
      }
      const value = process.env[key];
      if (value !== undefined) {
        env[key] = value;
      }
    }
    return env;
  }

  private preview(value: string): string {
    const redacted = this.redaction?.redact(value) ?? value;
    const normalized = redacted.replace(/\s+/g, ' ').trim();
    return normalized.length > 300 ? normalized.slice(0, 300) : normalized;
  }

  private logArg(value: string): string {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }
}
