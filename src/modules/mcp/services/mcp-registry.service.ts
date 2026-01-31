import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { McpClientService } from './mcp-client.service';
import { McpConfig } from '../types';

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

  loadConfigs(configs: Record<string, McpConfig>) {
    for (const [name, config] of Object.entries(configs)) {
      this.registerMcp(name, config);
    }
  }
}
