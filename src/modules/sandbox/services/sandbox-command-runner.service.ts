import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SandboxCommandRunner } from '../types';

const execFileAsync = promisify(execFile);

@Injectable()
export class SandboxCommandRunnerService implements SandboxCommandRunner {
  async run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    try {
      const result = await execFileAsync(command, args, {
        cwd: options.cwd,
        env: options.env,
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: 0,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? err.message,
        exitCode: typeof err.code === 'number' ? err.code : 1,
      };
    }
  }
}
