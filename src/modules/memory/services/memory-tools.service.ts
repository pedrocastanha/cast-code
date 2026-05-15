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
          'Search persistent local memory using the SQLite FTS index, with markdown compatibility fallback. Use natural-language queries.',
        schema: z.object({
          query: z.string().describe('Natural-language search query, search term, or regex pattern'),
        }),
      },
    );
  }

  private createRagSearchTool(): StructuredTool {
    return tool(
      async (input: { query?: string; topK?: number }) => {
        const query = String(input.query ?? '').trim();
        const { topK } = input;
        if (!this.platformService.isRagEnabled()) {
          return 'Platform RAG is not enabled for this linked project. Link a Cast project with Memory/RAG enabled before using rag_search.';
        }
        if (!query) {
          return this.platformMemoryOverview();
        }
        try {
          const retrieval = await this.platformService.retrieveMemory(query, topK);
          if (!retrieval.results.length) {
            return `No platform memory results found for "${query}".`;
          }
          const unitIds = uniqueStrings(retrieval.results.map((result) => result.unitId));
          const marked = retrieval.retrievalId
            ? await this.platformService.markMemoryUsed(retrieval.retrievalId, unitIds).catch(() => ({ accepted: 0 }))
            : { accepted: 0 };
          const header = [
            retrieval.retrievalId ? `retrieval=${retrieval.retrievalId}` : 'retrieval=untracked',
            `hits=${retrieval.results.length}`,
            Number.isFinite(retrieval.latencyMs) ? `latency=${retrieval.latencyMs}ms` : '',
            marked.accepted > 0 ? `used=${marked.accepted}` : '',
          ].filter(Boolean).join(' ');
          const rows = retrieval.results.map((result, index) => {
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
          return `${header}\n\n${rows}`;
        } catch (error) {
          return `Platform RAG search failed: ${(error as Error).message}`;
        }
      },
      {
        name: 'rag_search',
        description:
          'Search the linked Cast platform Memory/RAG index for project docs, decisions, and indexed context. Use a natural-language query. If the user asks what memory contains, call with an empty query to list indexed sources.',
        schema: z.object({
          query: z.string().optional().describe('Natural language search query for the project memory index. Leave empty only to list indexed sources.'),
          topK: z.number().int().min(1).max(20).optional().describe('Maximum number of memory results to retrieve.'),
        }),
      },
    );
  }

  private async platformMemoryOverview(): Promise<string> {
    try {
      const overview = await this.platformService.memoryOverview();
      const stats = overview.stats ?? {};
      const sources = overview.sources ?? [];
      const header = [
        'Platform memory overview',
        `sources=${stats.sources ?? sources.length}`,
        `ready=${stats.readySources ?? sources.filter((source) => source.status === 'ready').length}`,
        stats.units !== undefined ? `units=${stats.units}` : '',
        stats.edges !== undefined ? `edges=${stats.edges}` : '',
        stats.retrievalMode ? `mode=${stats.retrievalMode}` : '',
      ].filter(Boolean).join(' ');

      if (!sources.length) {
        return `${header}\n\nNo indexed memory sources found yet.`;
      }

      const rows = sources.slice(0, 12).map((source, index) => [
        `${index + 1}. ${source.title || source.id || 'Untitled source'}`,
        source.status ? `status=${source.status}` : '',
        source.unitCount !== undefined ? `units=${source.unitCount}` : '',
        source.description ? `- ${source.description}` : '',
      ].filter(Boolean).join(' '));
      const more = sources.length > rows.length ? `\n... ${sources.length - rows.length} more sources` : '';
      return `${header}\n\n${rows.join('\n')}${more}`;
    } catch (error) {
      return `Platform RAG overview failed: ${(error as Error).message}`;
    }
  }
}

function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(3) : '0.000';
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean))];
}
