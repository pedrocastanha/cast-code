import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

@Injectable()
export class SearchToolsService {
  getTools() {
    return [this.createWebSearchTool(), this.createWebFetchTool()];
  }

  private createWebSearchTool() {
    return tool(
      async ({ query }) => {
        return `Web search for "${query}" - Integration pending. Configure search provider in .cast/config.md`;
      },
      {
        name: 'web_search',
        description: 'Search the web for information.',
        schema: z.object({
          query: z.string().describe('Search query'),
        }),
      },
    );
  }

  private createWebFetchTool() {
    return tool(
      async ({ url }) => {
        try {
          const response = await fetch(url);
          const text = await response.text();

          if (text.length > 50000) {
            return text.slice(0, 50000) + '\n... (truncated)';
          }

          return text;
        } catch (error) {
          return `Error fetching URL: ${(error as Error).message}`;
        }
      },
      {
        name: 'web_fetch',
        description: 'Fetch content from a URL.',
        schema: z.object({
          url: z.string().describe('URL to fetch'),
        }),
      },
    );
  }
}
