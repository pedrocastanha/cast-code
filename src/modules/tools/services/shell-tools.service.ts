import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { PermissionService } from '../../permissions/services/permission.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

@Injectable()
export class ShellToolsService {
  private backgroundProcesses: Map<string, any> = new Map();
  private processCounter = 0;

  constructor(private permissionService: PermissionService) {}

  getTools() {
    return [this.createShellTool(), this.createBackgroundShellTool()];
  }

  private createShellTool() {
    return tool(
      async ({ command, cwd, timeout, description }) => {
        const allowed = await this.permissionService.checkPermission(command);

        if (!allowed) {
          return 'Command execution denied by user';
        }

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: cwd || process.cwd(),
            timeout: timeout || 120000, // Default 2min, max 10min
            maxBuffer: 10 * 1024 * 1024,
          });

          const output = stdout || stderr;

          if (output.length > 30000) {
            return output.slice(0, 30000) + '\n... (truncated)';
          }

          return output || 'Command completed with no output';
        } catch (error) {
          const execError = error as ExecError;

          if (execError.stdout || execError.stderr) {
            return `Exit with error:\n${execError.stderr || execError.stdout}`;
          }

          return `Error: ${execError.message}`;
        }
      },
      {
        name: 'shell',
        description:
          'Execute a shell command with permission checking. Use for git, npm, docker, etc. Dangerous commands will require user approval.',
        schema: z.object({
          command: z.string().describe('Command to execute'),
          cwd: z.string().optional().describe('Working directory'),
          timeout: z
            .number()
            .optional()
            .describe('Timeout in ms (default 120000, max 600000)'),
          description: z
            .string()
            .optional()
            .describe('Brief description of what this command does'),
        }),
      },
    );
  }

  private createBackgroundShellTool() {
    return tool(
      async ({ command, cwd }) => {
        const allowed = await this.permissionService.checkPermission(command);

        if (!allowed) {
          return 'Command execution denied by user';
        }

        const processId = `bg-${++this.processCounter}`;
        const outputFile = path.join(os.tmpdir(), `cast-bg-${processId}.log`);

        return new Promise((resolve) => {
          const child = spawn(command, {
            cwd: cwd || process.cwd(),
            shell: true,
            detached: true,
            stdio: 'ignore',
          });

          const logStream = require('fs').createWriteStream(outputFile);
          if (child.stdout) child.stdout.pipe(logStream);
          if (child.stderr) child.stderr.pipe(logStream);

          this.backgroundProcesses.set(processId, {
            process: child,
            command,
            outputFile,
            startedAt: Date.now(),
          });

          child.unref();

          resolve(
            JSON.stringify({
              success: true,
              processId,
              outputFile,
              message: 'Command started in background. Use task_output to check progress.',
            }),
          );
        });
      },
      {
        name: 'shell_background',
        description:
          'Execute a command in background. Use for long-running tasks like dev servers, watch mode, builds.',
        schema: z.object({
          command: z.string().describe('Command to execute in background'),
          cwd: z.string().optional().describe('Working directory'),
        }),
      },
    );
  }

  async getBackgroundOutput(processId: string): Promise<string> {
    const bgProcess = this.backgroundProcesses.get(processId);
    if (!bgProcess) {
      return 'Process not found';
    }

    try {
      const content = await fs.readFile(bgProcess.outputFile, 'utf-8');
      return content || 'No output yet';
    } catch (error) {
      return 'Error reading output: ' + (error as Error).message;
    }
  }

  killBackgroundProcess(processId: string): boolean {
    const bgProcess = this.backgroundProcesses.get(processId);
    if (!bgProcess) return false;

    try {
      process.kill(-bgProcess.process.pid);
      this.backgroundProcesses.delete(processId);
      return true;
    } catch {
      return false;
    }
  }
}
