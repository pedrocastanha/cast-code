import { Injectable, Optional } from '@nestjs/common';
import { execFile as execFileCallback } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

type CommandResult = {
  stdout?: string;
  stderr?: string;
};

type ScheduleWorkerDeps = {
  platform: NodeJS.Platform;
  homeDir: string;
  execFile: (file: string, args: string[]) => Promise<CommandResult>;
  mkdir: typeof fs.mkdir;
  writeFile: typeof fs.writeFile;
  readFile: typeof fs.readFile;
  unlink: typeof fs.unlink;
  access: typeof fs.access;
  nodePath: string;
  nodeArgs: string[];
  scriptPath: string;
};

export type ScheduleWorkerPlatform = 'linux-systemd' | 'unsupported';

export type ScheduleWorkerResult = {
  platform: ScheduleWorkerPlatform;
  supported: boolean;
  installed: boolean;
  projectRoot: string;
  serviceName?: string;
  timerName?: string;
  servicePath?: string;
  timerPath?: string;
  active?: string;
  enabled?: string;
  command?: string[];
  message: string;
  notes: string[];
};

@Injectable()
export class ScheduleWorkerService {
  private readonly deps: ScheduleWorkerDeps;

  constructor(
    @Optional()
    deps?: Partial<ScheduleWorkerDeps>,
  ) {
    this.deps = {
      platform: deps?.platform ?? process.platform,
      homeDir: deps?.homeDir ?? os.homedir(),
      execFile: deps?.execFile ?? ((file, args) => execFile(file, args)),
      mkdir: deps?.mkdir ?? fs.mkdir,
      writeFile: deps?.writeFile ?? fs.writeFile,
      readFile: deps?.readFile ?? fs.readFile,
      unlink: deps?.unlink ?? fs.unlink,
      access: deps?.access ?? fs.access,
      nodePath: deps?.nodePath ?? process.execPath,
      nodeArgs: deps?.nodeArgs ?? this.runtimeNodeArgs(),
      scriptPath: deps?.scriptPath ?? path.resolve(process.argv[1] ?? path.join(__dirname, '../../../main.js')),
    };
  }

  detectPlatform(): ScheduleWorkerPlatform {
    if (this.deps.platform === 'linux') {
      return 'linux-systemd';
    }
    return 'unsupported';
  }

  async install(input: { projectRoot: string; intervalSeconds?: number }): Promise<ScheduleWorkerResult> {
    const platform = this.detectPlatform();
    if (platform !== 'linux-systemd') {
      return this.unsupported(input.projectRoot);
    }
    return this.installSystemd(input.projectRoot, input.intervalSeconds ?? 60);
  }

  async uninstall(projectRoot: string): Promise<ScheduleWorkerResult> {
    const platform = this.detectPlatform();
    if (platform !== 'linux-systemd') {
      return this.unsupported(projectRoot);
    }

    const unit = this.systemdUnit(projectRoot);
    await this.runSystemctl(['--user', 'disable', '--now', unit.timerName]).catch(() => undefined);
    await this.unlinkIfExists(unit.timerPath);
    await this.unlinkIfExists(unit.servicePath);
    await this.runSystemctl(['--user', 'daemon-reload']).catch(() => undefined);

    return {
      platform,
      supported: true,
      installed: false,
      projectRoot,
      serviceName: unit.serviceName,
      timerName: unit.timerName,
      servicePath: unit.servicePath,
      timerPath: unit.timerPath,
      message: `Removed ${unit.timerName}.`,
      notes: [],
    };
  }

  async status(projectRoot: string): Promise<ScheduleWorkerResult> {
    const platform = this.detectPlatform();
    if (platform !== 'linux-systemd') {
      return this.unsupported(projectRoot);
    }

    const unit = this.systemdUnit(projectRoot);
    const installed = await this.exists(unit.timerPath);
    const active = await this.systemctlValue(['--user', 'is-active', unit.timerName]);
    const enabled = await this.systemctlValue(['--user', 'is-enabled', unit.timerName]);

    return {
      platform,
      supported: true,
      installed,
      projectRoot,
      serviceName: unit.serviceName,
      timerName: unit.timerName,
      servicePath: unit.servicePath,
      timerPath: unit.timerPath,
      active,
      enabled,
      message: installed ? `${unit.timerName} is installed.` : `${unit.timerName} is not installed.`,
      notes: this.systemdNotes(),
    };
  }

  private async installSystemd(projectRoot: string, intervalSeconds: number): Promise<ScheduleWorkerResult> {
    await this.ensureSystemdUserAvailable();

    const safeInterval = Math.max(30, Math.min(intervalSeconds, 24 * 60 * 60));
    const unit = this.systemdUnit(projectRoot);
    const command = this.workerCommand(projectRoot);
    await this.deps.mkdir(path.dirname(unit.servicePath), { recursive: true });
    await this.deps.writeFile(unit.servicePath, this.systemdServiceContent(projectRoot, command), 'utf-8');
    await this.deps.writeFile(unit.timerPath, this.systemdTimerContent(unit.serviceName, safeInterval), 'utf-8');
    await this.runSystemctl(['--user', 'daemon-reload']);
    await this.runSystemctl(['--user', 'enable', '--now', unit.timerName]);

    const status = await this.status(projectRoot);
    return {
      ...status,
      installed: true,
      command,
      message: `Installed ${unit.timerName}.`,
      notes: [
        `Runs every ${safeInterval}s while the user systemd instance is active.`,
        ...this.systemdNotes(),
      ],
    };
  }

  private systemdUnit(projectRoot: string): {
    serviceName: string;
    timerName: string;
    servicePath: string;
    timerPath: string;
  } {
    const hash = crypto.createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 12);
    const baseName = `cast-code-scheduler-${hash}`;
    const userDir = path.join(this.deps.homeDir, '.config', 'systemd', 'user');
    return {
      serviceName: `${baseName}.service`,
      timerName: `${baseName}.timer`,
      servicePath: path.join(userDir, `${baseName}.service`),
      timerPath: path.join(userDir, `${baseName}.timer`),
    };
  }

  private systemdServiceContent(projectRoot: string, command: string[]): string {
    return [
      '[Unit]',
      `Description=Cast Code scheduler tick for ${projectRoot}`,
      '',
      '[Service]',
      'Type=oneshot',
      `WorkingDirectory=${this.systemdQuote(path.resolve(projectRoot))}`,
      'Environment=CAST_SCHEDULER_BACKGROUND=1',
      'SyslogIdentifier=cast-code-scheduler',
      `ExecStart=${command.map((part) => this.systemdQuote(part)).join(' ')}`,
      '',
    ].join('\n');
  }

  private systemdTimerContent(serviceName: string, intervalSeconds: number): string {
    return [
      '[Unit]',
      'Description=Run Cast Code scheduler in the background',
      '',
      '[Timer]',
      'OnBootSec=2min',
      `OnUnitActiveSec=${intervalSeconds}s`,
      'AccuracySec=30s',
      `Unit=${serviceName}`,
      '',
      '[Install]',
      'WantedBy=timers.target',
      '',
    ].join('\n');
  }

  private workerCommand(projectRoot: string): string[] {
    return [
      this.deps.nodePath,
      ...this.deps.nodeArgs,
      this.deps.scriptPath,
      'schedule',
      'tick',
      '--background',
      '--project-root',
      path.resolve(projectRoot),
    ];
  }

  private runtimeNodeArgs(): string[] {
    return process.execArgv.filter((arg) =>
      arg !== '--watch'
      && !arg.startsWith('--watch=')
      && !arg.startsWith('--inspect')
      && !arg.startsWith('--inspect-brk'));
  }

  private async ensureSystemdUserAvailable(): Promise<void> {
    try {
      await this.runSystemctl(['--user', '--version']);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`systemd user services are not available: ${message}`);
    }
  }

  private async runSystemctl(args: string[]): Promise<CommandResult> {
    return this.deps.execFile('systemctl', args);
  }

  private async systemctlValue(args: string[]): Promise<string> {
    try {
      const result = await this.runSystemctl(args);
      return (result.stdout ?? '').trim() || 'unknown';
    } catch (error: any) {
      const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
      const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
      return stdout || stderr || 'unknown';
    }
  }

  private systemdQuote(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private systemdNotes(): string[] {
    return [
      'On Ubuntu, this uses a systemd user timer, so Cast does not need to stay open.',
      'If you need it to run after logout, enable lingering manually: loginctl enable-linger $USER',
    ];
  }

  private unsupported(projectRoot: string): ScheduleWorkerResult {
    return {
      platform: 'unsupported',
      supported: false,
      installed: false,
      projectRoot,
      message: `Background scheduler install is not supported for ${this.deps.platform} yet.`,
      notes: ['Linux/systemd user timers are supported in this version.'],
    };
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await this.deps.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async unlinkIfExists(filePath: string): Promise<void> {
    try {
      await this.deps.unlink(filePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
