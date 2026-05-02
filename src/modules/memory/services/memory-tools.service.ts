import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { StructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemoryService } from './memory.service';
import { PlatformService } from '../../platform/services/platform.service';

@Injectable()
export class MemoryToolsService {
  constructor(
    private readonly memoryService: MemoryService,
    @Inject(forwardRef(() => PlatformService))
    private readonly platformService: PlatformService,
  ) {}

  getTools(): StructuredTool[] {
    return [
      this.createMemoryWriteTool(),
      this.createMemoryReadTool(),
      this.createMemorySearchTool(),
      this.createRagSearchTool(),
    ];
  }

  private createMemoryWriteTool(): StructuredTool {
    return tool(
      async (input: { filename: string; content: string }) => {
        const { filename, content } = input;
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

  private createMemoryReadTool(): StructuredTool {
    return tool(
      async (input: { filename?: string }) => {
        const { filename } = input;
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

  private createMemorySearchTool(): StructuredTool {
    return tool(
      async (input: { query: string }) => {
        const { query } = input;
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

  private createRagSearchTool(): StructuredTool {
    return tool(
      async (input: { query: string; topK?: number }) => {
        const { query, topK } = input;
        if (!this.platformService.isRagEnabled()) {
          return 'Platform RAG is not enabled for this linked project. Link a Cast project with Memory/RAG enabled before using rag_search.';
        }
        try {
          const retrieval = await this.platformService.retrieveMemory(query, topK);
          if (!retrieval.results.length) {
            return `No platform memory results found for "${query}".`;
          }
          return retrieval.results.map((result, index) => {
            const related = (result.related || [])
              .map((item) => `    - related ${item.unitId}: ${item.content}`)
              .join('\n');
            return [
              `${index + 1}. ${result.unitId} score=${formatScore(result.score)}`,
              result.sourceId ? `   source=${result.sourceId}` : '',
              `   ${result.content}`,
              related,
            ].filter(Boolean).join('\n');
          }).join('\n\n');
        } catch (error) {
          return `Platform RAG search failed: ${(error as Error).message}`;
        }
      },
      {
        name: 'rag_search',
        description:
          'Search the linked Cast platform Memory/RAG index for project docs, decisions, and indexed context. Use this before answering questions that may depend on platform knowledge.',
        schema: z.object({
          query: z.string().min(1).describe('Natural language search query for the project memory index.'),
          topK: z.number().int().min(1).max(20).optional().describe('Maximum number of memory results to retrieve.'),
        }),
      },
    );
  }
}

function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(3) : '0.000';
}
