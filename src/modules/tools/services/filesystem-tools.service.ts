import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

const DEFAULT_IGNORE = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.next/**',
  '.nuxt/**',
  '*.min.js',
  '*.min.css',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

@Injectable()
export class FilesystemToolsService {
  private readFiles: Set<string> = new Set();

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
            return 'Error: file_path is required';
          }

          const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(process.cwd(), filePath);

          try {
            const stat = await fs.stat(resolvedPath);

            if (stat.isDirectory()) {
              const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
              const listing = entries
                .slice(0, 50)
                .map((e) => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`)
                .join('\n');
              return `"${resolvedPath}" is a directory. Contents:\n${listing}${entries.length > 50 ? `\n... (${entries.length - 50} more)` : ''}\n\nUse ls for full listing or glob to search within.`;
            }

            const buffer = Buffer.alloc(512);
            const fd = await fs.open(resolvedPath, 'r');
            await fd.read(buffer, 0, 512, 0);
            await fd.close();

            const hasBinaryBytes = buffer.some(
              (byte, i) => i < 512 && byte === 0,
            );
            if (hasBinaryBytes) {
              return `"${resolvedPath}" appears to be a binary file (${Math.round(stat.size / 1024)}KB). Cannot display binary content.`;
            }
          } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
              const basename = path.basename(filePath);
              const matches = await glob(`**/${basename}`, {
                cwd: process.cwd(),
                ignore: DEFAULT_IGNORE,
              });

              if (matches.length > 0) {
                return `File not found at "${resolvedPath}".\n\nDid you mean one of these?\n${matches.slice(0, 5).map((m) => `  - ${m}`).join('\n')}`;
              }
              return `File not found: "${resolvedPath}"`;
            }
            return `Error accessing file: ${err.message}`;
          }

          const content = await fs.readFile(resolvedPath, 'utf-8');

          if (!content.trim()) {
            return `File "${resolvedPath}" exists but is empty (0 bytes of content).`;
          }

          const lines = content.split('\n');
          const start = offset || 0;
          const end = limit ? start + limit : lines.length;
          const selectedLines = lines.slice(start, end);

          const formatted = selectedLines
            .map((line, i) => {
              const lineNum = start + i + 1;
              const truncated =
                line.length > 2000
                  ? line.slice(0, 2000) + '... (truncated)'
                  : line;
              return `${lineNum}: ${truncated}`;
            })
            .join('\n');

          this.readFiles.add(resolvedPath);

          if (end < lines.length) {
            return `${formatted}\n\n(Showing lines ${start + 1}-${end} of ${lines.length} total. Use offset/limit to read more.)`;
          }

          return formatted;
        } catch (error) {
          return `Error reading file: ${(error as Error).message}`;
        }
      },
      {
        name: 'read_file',
        description:
          'Read contents of a file. Returns numbered lines. Supports both absolute and relative paths. ALWAYS use this before editing a file.',
        schema: z.object({
          file_path: z
            .string()
            .describe('Path to the file (absolute or relative to working directory)'),
          offset: z
            .number()
            .optional()
            .describe('Line number to start from (0-indexed)'),
          limit: z
            .number()
            .optional()
            .describe('Number of lines to read'),
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

          if (!filePath || content === undefined) {
            return 'Error: file_path and content are required';
          }

          const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(process.cwd(), filePath);

          let fileExists = false;
          try {
            await fs.access(resolvedPath);
            fileExists = true;
          } catch {
          }

          if (fileExists && !this.readFiles.has(resolvedPath)) {
            this.readFiles.add(resolvedPath);
          }

          const dir = path.dirname(resolvedPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(resolvedPath, content, 'utf-8');

          this.readFiles.add(resolvedPath);

          const lines = content.split('\n').length;
          return `File written successfully: ${resolvedPath} (${lines} lines)`;
        } catch (error) {
          return `Error writing file: ${(error as Error).message}`;
        }
      },
      {
        name: 'write_file',
        description:
          'Write content to a file. Creates directories if needed. Prefer edit_file for modifying existing files.',
        schema: z.object({
          file_path: z
            .string()
            .describe('Path to the file (absolute or relative)'),
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
          const replaceAll =
            (input as any).replaceAll || (input as any).replace_all || false;

          if (!filePath || oldString === undefined || newString === undefined) {
            return 'Error: file_path, old_string, and new_string are required';
          }

          const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(process.cwd(), filePath);

          if (oldString === newString) {
            return 'Error: old_string and new_string are identical. No changes needed.';
          }

          if (!this.readFiles.has(resolvedPath)) {
            return `Error: You must read_file("${filePath}") before editing it. This ensures you understand the current content.`;
          }

          const content = await fs.readFile(resolvedPath, 'utf-8');

          if (!content.includes(oldString)) {
            const lines = content.split('\n');
            const trimmedOld = oldString.trim();
            const approxMatch = lines.findIndex((l) =>
              l.trim().includes(trimmedOld),
            );

            if (approxMatch !== -1) {
              return `Error: exact old_string not found. Possible match at line ${approxMatch + 1}:\n  "${lines[approxMatch].trim()}"\n\nMake sure whitespace and indentation match exactly.`;
            }

            return `Error: old_string not found in file. Make sure it matches the file content exactly (including whitespace).`;
          }

          const occurrences = content.split(oldString).length - 1;
          if (occurrences > 1 && !replaceAll) {
            return `Error: old_string found ${occurrences} times. Either:\n1. Provide more surrounding context to make it unique\n2. Use replace_all=true to replace all occurrences`;
          }

          const newContent = replaceAll
            ? content.replaceAll(oldString, newString)
            : content.replace(oldString, newString);

          await fs.writeFile(resolvedPath, newContent, 'utf-8');

          const replacedCount = replaceAll ? occurrences : 1;
          return `File edited successfully: ${resolvedPath} (${replacedCount} replacement${replacedCount > 1 ? 's' : ''})`;
        } catch (error) {
          return `Error editing file: ${(error as Error).message}`;
        }
      },
      {
        name: 'edit_file',
        description:
          'Edit a file by replacing exact string matches. You MUST read_file first. Provides helpful error messages if the string is not found or ambiguous.',
        schema: z.object({
          file_path: z
            .string()
            .describe('Path to the file (absolute or relative)'),
          old_string: z
            .string()
            .describe('Exact text to replace (must match exactly including whitespace)'),
          new_string: z
            .string()
            .describe('New text to replace with (must be different from old_string)'),
          replace_all: z
            .boolean()
            .optional()
            .default(false)
            .describe('Replace all occurrences (default: false)'),
        }),
      },
    );
  }

  private createGlobTool() {
    return tool(
      async ({ pattern, cwd }) => {
        try {
          const searchDir = cwd || process.cwd();
          const files = await glob(pattern, {
            cwd: searchDir,
            ignore: DEFAULT_IGNORE,
          });

          if (files.length === 0) {
            return `No files found matching "${pattern}" in ${searchDir}`;
          }

          const sorted = files.sort();
          const limited = sorted.slice(0, 200);

          let result = limited.join('\n');
          if (sorted.length > 200) {
            result += `\n\n... (${sorted.length - 200} more files. Use a more specific pattern.)`;
          }

          return result;
        } catch (error) {
          return `Error: ${(error as Error).message}`;
        }
      },
      {
        name: 'glob',
        description:
          'Find files matching a glob pattern. Ignores node_modules, .git, dist by default. Returns up to 200 results sorted alphabetically.',
        schema: z.object({
          pattern: z
            .string()
            .describe('Glob pattern (e.g., "**/*.ts", "src/**/*.service.ts")'),
          cwd: z
            .string()
            .optional()
            .describe('Working directory (default: project root)'),
        }),
      },
    );
  }

  private createGrepTool() {
    return tool(
      async (input) => {
        try {
          const pattern = (input as any).pattern;
          const searchPath =
            (input as any).searchPath || (input as any).search_path;
          const filePattern =
            (input as any).filePattern || (input as any).file_pattern;
          const contextLines =
            (input as any).contextLines || (input as any).context_lines || 0;
          const caseSensitive =
            (input as any).caseSensitive ?? (input as any).case_sensitive ?? false;
          const outputMode =
            (input as any).outputMode || (input as any).output_mode || 'content';
          const maxResults =
            (input as any).maxResults || (input as any).max_results || 100;

          if (!pattern) {
            return 'Error: pattern is required';
          }

          const baseDir = searchPath || process.cwd();
          const files = await glob(filePattern || '**/*', {
            cwd: baseDir,
            nodir: true,
            ignore: DEFAULT_IGNORE,
          });

          const flags = caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(pattern, flags);

          if (outputMode === 'files_with_matches') {
            const matchingFiles: string[] = [];
            for (const file of files.slice(0, 500)) {
              try {
                const fullPath = path.join(baseDir, file);
                const content = await fs.readFile(fullPath, 'utf-8');
                if (regex.test(content)) {
                  matchingFiles.push(file);
                }
                regex.lastIndex = 0;
              } catch {
                continue;
              }
            }
            if (matchingFiles.length === 0) return 'No matching files found';
            return matchingFiles.slice(0, maxResults).join('\n');
          }

          if (outputMode === 'count') {
            const counts: string[] = [];
            for (const file of files.slice(0, 500)) {
              try {
                const fullPath = path.join(baseDir, file);
                const content = await fs.readFile(fullPath, 'utf-8');
                const allFlags = caseSensitive ? 'g' : 'gi';
                const matches = content.match(new RegExp(pattern, allFlags));
                if (matches && matches.length > 0) {
                  counts.push(`${file}: ${matches.length}`);
                }
              } catch {
                continue;
              }
            }
            if (counts.length === 0) return 'No matches found';
            return counts.slice(0, maxResults).join('\n');
          }

          const results: string[] = [];
          let totalMatches = 0;

          for (const file of files.slice(0, 500)) {
            if (totalMatches >= maxResults) break;

            try {
              const fullPath = path.join(baseDir, file);
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split('\n');

              const matchingLineIndices: number[] = [];
              lines.forEach((line, index) => {
                if (regex.test(line)) {
                  matchingLineIndices.push(index);
                }
                regex.lastIndex = 0;
              });

              if (matchingLineIndices.length === 0) continue;

              for (const lineIdx of matchingLineIndices) {
                if (totalMatches >= maxResults) break;

                if (contextLines > 0) {
                  const start = Math.max(0, lineIdx - contextLines);
                  const end = Math.min(lines.length - 1, lineIdx + contextLines);

                  results.push(`--- ${file} ---`);
                  for (let i = start; i <= end; i++) {
                    const prefix = i === lineIdx ? '>' : ' ';
                    results.push(`${prefix} ${i + 1}: ${lines[i].trimEnd()}`);
                  }
                  results.push('');
                } else {
                  results.push(`${file}:${lineIdx + 1}: ${lines[lineIdx].trim()}`);
                }
                totalMatches++;
              }
            } catch {
              continue;
            }
          }

          if (results.length === 0) {
            return 'No matches found';
          }

          let output = results.join('\n');
          if (totalMatches >= maxResults) {
            output += `\n\n(Showing first ${maxResults} matches. Use max_results to see more or narrow your search.)`;
          }

          return output;
        } catch (error) {
          return `Error: ${(error as Error).message}`;
        }
      },
      {
        name: 'grep',
        description:
          'Search for a regex pattern in files. Supports context lines, case sensitivity, and multiple output modes. Ignores node_modules, .git, dist by default.',
        schema: z.object({
          pattern: z.string().describe('Regex pattern to search'),
          search_path: z
            .string()
            .optional()
            .describe('Directory to search in (default: project root)'),
          file_pattern: z
            .string()
            .optional()
            .describe('Glob pattern for files (e.g., "**/*.ts")'),
          context_lines: z
            .number()
            .optional()
            .describe('Number of context lines before/after each match (like grep -C)'),
          case_sensitive: z
            .boolean()
            .optional()
            .describe('Case sensitive search (default: false)'),
          output_mode: z
            .enum(['content', 'files_with_matches', 'count'])
            .optional()
            .describe(
              'Output mode: "content" (default), "files_with_matches" (just paths), "count" (match counts)',
            ),
          max_results: z
            .number()
            .optional()
            .describe('Maximum results to return (default: 100)'),
        }),
      },
    );
  }

  private createLsTool() {
    return tool(
      async (input) => {
        try {
          const directory =
            (input as any).directory || (input as any).path || process.cwd();

          const resolvedPath = path.isAbsolute(directory)
            ? directory
            : path.resolve(process.cwd(), directory);

          const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

          if (entries.length === 0) {
            return `Directory "${resolvedPath}" is empty`;
          }

          const dirs = entries
            .filter((e) => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name));
          const files = entries
            .filter((e) => !e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name));

          const lines = [
            ...dirs.map((e) => `d ${e.name}/`),
            ...files.map((e) => `f ${e.name}`),
          ];

          return lines.join('\n');
        } catch (error) {
          const err = error as NodeJS.ErrnoException;
          if (err.code === 'ENOENT') {
            return `Directory not found: "${(input as any).directory || (input as any).path}"`;
          }
          return `Error: ${err.message}`;
        }
      },
      {
        name: 'ls',
        description:
          'List directory contents. Shows directories first (with /), then files. Supports relative paths.',
        schema: z.object({
          directory: z
            .string()
            .optional()
            .describe('Directory path (default: working directory)'),
          path: z
            .string()
            .optional()
            .describe('Alias for directory'),
        }),
      },
    );
  }
}
