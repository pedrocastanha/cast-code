import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryService } from './memory.service';

@Injectable()
export class MemoryToolsService {
  constructor(private readonly memoryService: MemoryService) {}

  getTools() {
    return [
      this.createMemoryWriteTool(),
      this.createMemoryReadTool(),
      this.createMemorySearchTool(),
    ];
  }

  private createMemoryWriteTool() {
    return tool(
      async ({ filename, content }) => {
        return this.memoryService.write(filename, content);
      },
      {
        name: 'memory_write',
        description:
          'Save a note to persistent project memory. Use this to record important learnings, patterns that worked, mistakes to avoid, and project-specific insights. Memory persists across sessions.',
        schema: z.object({
          filename: z
            .string()
            .describe(
              'Name for the memory file (e.g., "architecture", "bugs", "decisions"). Will be saved as .md',
            ),
          content: z
            .string()
            .describe('Content to save. Use markdown formatting.'),
        }),
      },
    );
  }

  private createMemoryReadTool() {
    return tool(
      async ({ filename }) => {
        return this.memoryService.read(filename);
      },
      {
        name: 'memory_read',
        description:
          'Read from persistent project memory. Without a filename, lists all memory files. With a filename, returns its contents.',
        schema: z.object({
          filename: z
            .string()
            .optional()
            .describe(
              'Name of the memory file to read (without .md). Omit to list all files.',
            ),
        }),
      },
    );
  }

  private createMemorySearchTool() {
    return tool(
      async ({ query }) => {
        return this.memoryService.search(query);
      },
      {
        name: 'memory_search',
        description:
          'Search through all memory files for a term or pattern. Returns matching lines from all memory files.',
        schema: z.object({
          query: z.string().describe('Search term or regex pattern'),
        }),
      },
    );
  }
}
