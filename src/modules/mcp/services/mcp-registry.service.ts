import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { McpClientService } from './mcp-client.service';
import { McpConfig, McpServerSummary } from '../types';

@Injectable()
export class McpRegistryService implements OnModuleDestroy {
  private configs: Map<string, McpConfig> = new Map();

  constructor(private readonly mcpClient: McpClientService) {}

  onModuleDestroy() {
    this.mcpClient.disconnectAll();
  }

  registerMcp(name: string, config: McpConfig) {
    this.configs.set(name, config);
  }

  async connectMcp(name: string): Promise<boolean> {
    const config = this.configs.get(name);

    if (!config) {
      return false;
    }

    return this.mcpClient.connect(name, config);
  }

  async connectAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const name of this.configs.keys()) {
      results.set(name, await this.connectMcp(name));
    }

    return results;
  }

  getMcpTools(name: string): StructuredTool[] {
    const mcpTools = this.mcpClient.getTools(name);

    return mcpTools.map((mcpTool) => {
      const schema = this.convertSchemaToZod(mcpTool.inputSchema);

      return tool(
        async (input) => {
          try {
            const result = await this.mcpClient.callTool(name, mcpTool.name, input);
            return JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error calling ${mcpTool.name}: ${(error as Error).message}`;
          }
        },
        {
          name: `${name}_${mcpTool.name}`,
          description: mcpTool.description,
          schema,
        },
      );
    });
  }

  getAllMcpTools(): StructuredTool[] {
    const allTools: StructuredTool[] = [];

    for (const name of this.configs.keys()) {
      allTools.push(...this.getMcpTools(name));
    }

    return allTools;
  }

  private convertSchemaToZod(schema: Record<string, unknown>): z.ZodObject<any> {
    const properties = (schema.properties || {}) as Record<string, any>;
    const required = (schema.required || []) as string[];
    const zodShape: Record<string, z.ZodTypeAny> = {};

    for (const [key, prop] of Object.entries(properties)) {
      let zodType: z.ZodTypeAny;

      switch (prop.type) {
        case 'string':
          zodType = z.string();
          break;
        case 'number':
          zodType = z.number();
          break;
        case 'boolean':
          zodType = z.boolean();
          break;
        case 'array':
          zodType = z.array(z.any());
          break;
        case 'object':
          zodType = z.record(z.any());
          break;
        default:
          zodType = z.any();
      }

      if (prop.description) {
        zodType = zodType.describe(prop.description);
      }

      if (!required.includes(key)) {
        zodType = zodType.optional();
      }

      zodShape[key] = zodType;
    }

    return z.object(zodShape);
  }

  getServerSummaries(): McpServerSummary[] {
    const summaries: McpServerSummary[] = [];

    for (const [name, config] of this.configs) {
      const status = this.mcpClient.getStatus(name);
      const tools = this.mcpClient.getTools(name);

      summaries.push({
        name,
        transport: config.type,
        status,
        toolCount: tools.length,
        toolNames: tools.map(t => `${name}_${t.name}`),
        toolDescriptions: tools.map(t => ({
          name: `${name}_${t.name}`,
          description: t.description,
        })),
      });
    }

    return summaries;
  }

  getDiscoveryTools(): StructuredTool[] {
    return [
      tool(
        async () => {
          const summaries = this.getServerSummaries();
          if (summaries.length === 0) {
            return 'No MCP servers configured. Use the /mcp add command in the REPL to connect one.';
          }
          return summaries.map(s =>
            `${s.name} (${s.transport}) — ${s.status} — ${s.toolCount} tools`
          ).join('\n');
        },
        {
          name: 'mcp_list_servers',
          description: 'List all connected MCP servers with their status, transport type, and tool count',
          schema: z.object({}),
        },
      ),
      tool(
        async (input) => {
          const summaries = this.getServerSummaries();

          if (input.server) {
            const server = summaries.find(s => s.name === input.server);
            if (!server) {
              return `Server "${input.server}" not found. Available: ${summaries.map(s => s.name).join(', ')}`;
            }
            if (server.toolDescriptions.length === 0) {
              return `Server "${input.server}" has no tools available (status: ${server.status})`;
            }
            return server.toolDescriptions.map(t =>
              `${t.name}: ${t.description}`
            ).join('\n');
          }

          if (summaries.length === 0) {
            return 'No MCP servers configured.';
          }

          const sections: string[] = [];
          for (const s of summaries) {
            const header = `## ${s.name} (${s.transport}, ${s.status}) — ${s.toolCount} tools`;
            const toolList = s.toolDescriptions.map(t => `- ${t.name}: ${t.description}`).join('\n');
            sections.push(`${header}\n${toolList || '(no tools)'}`);
          }
          return sections.join('\n\n');
        },
        {
          name: 'mcp_list_tools',
          description: 'List tools from a specific MCP server or all servers. Optionally filter by server name.',
          schema: z.object({
            server: z.string().optional().describe('Server name to filter tools for. If omitted, lists all tools from all servers.'),
          }),
        },
      ),
    ];
  }

  loadConfigs(configs: Record<string, McpConfig>) {
    for (const [name, config] of Object.entries(configs)) {
      this.registerMcp(name, config);
    }
  }
}
