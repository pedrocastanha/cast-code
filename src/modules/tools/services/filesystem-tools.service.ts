import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

@Injectable()
export class FilesystemToolsService {
  getTools() {
    return [
      this.createReadFileTool(),
      this.createWriteFileTool(),
      this.createEditFileTool(),
      this.createGlobTool(),
      this.createGrepTool(),
      this.createLsTool(),
    ];
  }

  private createReadFileTool() {
    return tool(
      async ({ filePath, offset, limit }) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          const start = offset || 0;
          const end = limit ? start + limit : lines.length;
          const selectedLines = lines.slice(start, end);

          return selectedLines.map((line, i) => `${start + i + 1}: ${line}`).join('\n');
        } catch (error) {
          return `Error reading file: ${(error as Error).message}`;
        }
      },
      {
        name: 'read_file',
        description: 'Read contents of a file. Returns numbered lines.',
        schema: z.object({
          filePath: z.string().describe('Absolute path to the file'),
          offset: z.number().optional().describe('Line number to start from (0-indexed)'),
          limit: z.number().optional().describe('Number of lines to read'),
        }),
      },
    );
  }

  private createWriteFileTool() {
    return tool(
      async ({ filePath, content }) => {
        try {
          const dir = path.dirname(filePath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(filePath, content, 'utf-8');

          return `File written successfully: ${filePath}`;
        } catch (error) {
          return `Error writing file: ${(error as Error).message}`;
        }
      },
      {
        name: 'write_file',
        description: 'Write content to a file. Creates directories if needed.',
        schema: z.object({
          filePath: z.string().describe('Absolute path to the file'),
          content: z.string().describe('Content to write'),
        }),
      },
    );
  }

  private createEditFileTool() {
    return tool(
      async ({ filePath, oldString, newString, replaceAll }) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');

          if (!content.includes(oldString)) {
            return `Error: old_string not found in file`;
          }

          const occurrences = content.split(oldString).length - 1;
          if (occurrences > 1 && !replaceAll) {
            return `Error: old_string found ${occurrences} times. Use replaceAll=true or provide more context.`;
          }

          const newContent = replaceAll
            ? content.replaceAll(oldString, newString)
            : content.replace(oldString, newString);

          await fs.writeFile(filePath, newContent, 'utf-8');

          return `File edited successfully: ${filePath}`;
        } catch (error) {
          return `Error editing file: ${(error as Error).message}`;
        }
      },
      {
        name: 'edit_file',
        description: 'Edit a file by replacing a string with another.',
        schema: z.object({
          filePath: z.string().describe('Absolute path to the file'),
          oldString: z.string().describe('Text to replace'),
          newString: z.string().describe('New text'),
          replaceAll: z.boolean().optional().default(false).describe('Replace all occurrences'),
        }),
      },
    );
  }

  private createGlobTool() {
    return tool(
      async ({ pattern, cwd }) => {
        try {
          const files = await glob(pattern, { cwd: cwd || process.cwd() });

          if (files.length === 0) {
            return 'No files found matching pattern';
          }

          return files.join('\n');
        } catch (error) {
          return `Error: ${(error as Error).message}`;
        }
      },
      {
        name: 'glob',
        description: 'Find files matching a glob pattern.',
        schema: z.object({
          pattern: z.string().describe('Glob pattern (e.g., **/*.ts)'),
          cwd: z.string().optional().describe('Working directory'),
        }),
      },
    );
  }

  private createGrepTool() {
    return tool(
      async ({ pattern, searchPath, filePattern }) => {
        try {
          const files = await glob(filePattern || '**/*', {
            cwd: searchPath || process.cwd(),
            nodir: true,
          });

          const regex = new RegExp(pattern, 'gi');
          const results: string[] = [];

          for (const file of files.slice(0, 100)) {
            try {
              const fullPath = path.join(searchPath || process.cwd(), file);
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');

              lines.forEach((line, index) => {
                if (regex.test(line)) {
                  results.push(`${file}:${index + 1}: ${line.trim()}`);
                }
                regex.lastIndex = 0;
              });
            } catch {
              continue;
            }
          }

          if (results.length === 0) {
            return 'No matches found';
          }

          return results.slice(0, 50).join('\n');
        } catch (error) {
          return `Error: ${(error as Error).message}`;
        }
      },
      {
        name: 'grep',
        description: 'Search for a pattern in files.',
        schema: z.object({
          pattern: z.string().describe('Regex pattern to search'),
          searchPath: z.string().optional().describe('Directory to search in'),
          filePattern: z.string().optional().describe('Glob pattern for files'),
        }),
      },
    );
  }

  private createLsTool() {
    return tool(
      async (input) => {
        try {
          const directory = (input as any).directory || (input as any).path;

          if (!directory) {
            return 'Error: directory parameter is required';
          }

          const entries = await fs.readdir(directory, { withFileTypes: true });

          return entries.map((e) => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`).join('\n');
        } catch (error) {
          return `Error: ${(error as Error).message}`;
        }
      },
      {
        name: 'ls',
        description: 'List directory contents.',
        schema: z.object({
          directory: z.string().describe('Directory path').optional(),
          path: z.string().describe('Directory path (alias for directory)').optional(),
        }).refine(data => data.directory || data.path, {
          message: 'Either directory or path must be provided',
        }),
      },
    );
  }
}
