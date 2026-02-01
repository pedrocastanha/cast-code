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
      async (input) => {
        try {
          const filePath = (input as any).filePath || (input as any).file_path;
          const offset = (input as any).offset;
          const limit = (input as any).limit;

          if (!filePath) {
            return 'Error: filePath is required';
          }

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
          file_path: z.string().describe('Absolute path to the file'),
          offset: z.number().optional().describe('Line number to start from (0-indexed)'),
          limit: z.number().optional().describe('Number of lines to read'),
        }),
      },
    );
  }

  private createWriteFileTool() {
    return tool(
      async (input) => {
        try {
          const filePath = (input as any).filePath || (input as any).file_path;
          const content = (input as any).content;

          if (!filePath || !content) {
            return 'Error: filePath and content are required';
          }

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
          file_path: z.string().describe('Absolute path to the file'),
          content: z.string().describe('Content to write'),
        }),
      },
    );
  }

  private createEditFileTool() {
    return tool(
      async (input) => {
        try {
          const filePath = (input as any).filePath || (input as any).file_path;
          const oldString = (input as any).oldString || (input as any).old_string;
          const newString = (input as any).newString || (input as any).new_string;
          const replaceAll = (input as any).replaceAll || (input as any).replace_all || false;

          if (!filePath || !oldString || !newString) {
            return 'Error: filePath, oldString, and newString are required';
          }

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
          file_path: z.string().describe('Absolute path to the file'),
          old_string: z.string().describe('Text to replace'),
          new_string: z.string().describe('New text'),
          replace_all: z.boolean().optional().default(false).describe('Replace all occurrences'),
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
      async (input) => {
        try {
          const pattern = (input as any).pattern;
          const searchPath = (input as any).searchPath || (input as any).search_path;
          const filePattern = (input as any).filePattern || (input as any).file_pattern;

          if (!pattern) {
            return 'Error: pattern is required';
          }

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
          search_path: z.string().optional().describe('Directory to search in'),
          file_pattern: z.string().optional().describe('Glob pattern for files'),
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
