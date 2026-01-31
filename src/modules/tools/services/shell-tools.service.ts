import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

@Injectable()
export class ShellToolsService {
  getTools() {
    return [this.createShellTool()];
  }

  private createShellTool() {
    return tool(
      async ({ command, cwd, timeout }) => {
        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: cwd || process.cwd(),
            timeout: timeout || 120000,
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
        description: 'Execute a shell command. Use for git, npm, docker, etc.',
        schema: z.object({
          command: z.string().describe('Command to execute'),
          cwd: z.string().optional().describe('Working directory'),
          timeout: z.number().optional().describe('Timeout in ms (max 600000)'),
        }),
      },
    );
  }
}
