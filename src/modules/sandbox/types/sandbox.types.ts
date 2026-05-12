export type SandboxMode = 'none' | 'snapshot' | 'git-worktree' | 'docker';

export interface DockerSandboxConfig {
  image?: string;
  envAllowlist?: string[];
  network?: 'none' | 'host' | 'bridge';
  readWrite?: boolean;
}

export interface SandboxRunConfig {
  mode?: SandboxMode;
  rollbackOnFailure?: boolean;
  allowNetwork?: boolean;
  docker?: DockerSandboxConfig;
}

export interface SandboxRunOptions {
  runId: string;
  projectRoot: string;
  artifactDir?: string;
  config?: SandboxRunConfig;
  requestedMode?: SandboxMode;
  fallbackReason?: string;
}

export interface SandboxContext {
  mode: SandboxMode;
  requestedMode: SandboxMode;
  runId: string;
  projectRoot: string;
  root: string;
  artifactDir?: string;
  checkpointId?: string;
  worktreePath?: string;
  fallbackReason?: string;
  docker?: {
    image: string;
    network: 'none' | 'host' | 'bridge';
    readWrite: boolean;
    env: Record<string, string>;
  };
  commandLog: string[];
}

export interface SandboxArtifact {
  kind: 'sandbox-summary' | 'sandbox-diff' | 'sandbox-command-log' | 'sandbox-snapshot' | 'sandbox-worktree';
  name: string;
  path: string;
}

export interface SandboxRunResult<T = unknown> {
  value: T;
  context: SandboxContext;
  artifacts: SandboxArtifact[];
}

export interface SandboxBackend {
  readonly mode: SandboxMode;
  prepare(options: SandboxRunOptions): Promise<SandboxContext>;
  capture(context: SandboxContext): Promise<Partial<SandboxContext> & { diff?: string; status?: string; snapshot?: Record<string, unknown> }>;
  dispose(context: SandboxContext): Promise<void>;
  rollback?(runId: string, projectRoot?: string): Promise<boolean>;
}

export interface SandboxCommandRunner {
  run(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}
