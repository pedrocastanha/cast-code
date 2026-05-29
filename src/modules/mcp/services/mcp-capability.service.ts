import { Injectable } from '@nestjs/common';
import { castTool, CastTool } from '../../../common/interfaces/cast-tool.interface';
import { z } from 'zod';
import { McpClientService } from './mcp-client.service';
import { McpRiskScannerService } from './mcp-risk-scanner.service';
import { McpCapabilities } from '../types';

@Injectable()
export class McpCapabilityService {
  constructor(
    private readonly mcpClient: McpClientService,
    private readonly riskScanner: McpRiskScannerService = new McpRiskScannerService(),
  ) {}

  getUtilityTools(serverName: string, capabilities: McpCapabilities): CastTool[] {
    const tools: CastTool[] = [];

    if (capabilities.resources) {
      tools.push(
        castTool(
          async () => this.safeResult(serverName, 'list_resources', await this.mcpClient.listResources(serverName)),
          {
            name: `mcp_${serverName}_list_resources`,
            description: `List MCP resources exposed by ${serverName}.`,
            schema: z.object({}),
          },
        ),
        castTool(
          async (input) => this.safeResult(serverName, 'read_resource', await this.mcpClient.readResource(serverName, input.uri)),
          {
            name: `mcp_${serverName}_read_resource`,
            description: `Read an MCP resource from ${serverName} by URI.`,
            schema: z.object({
              uri: z.string().describe('Resource URI returned by the list resources utility.'),
            }),
          },
        ),
      );
    }

    if (capabilities.prompts) {
      tools.push(
        castTool(
          async () => this.safeResult(serverName, 'list_prompts', await this.mcpClient.listPrompts(serverName)),
          {
            name: `mcp_${serverName}_list_prompts`,
            description: `List MCP prompts exposed by ${serverName}.`,
            schema: z.object({}),
          },
        ),
        castTool(
          async (input) => this.safeResult(serverName, 'get_prompt', await this.mcpClient.getPrompt(serverName, input.name, input.arguments ?? {})),
          {
            name: `mcp_${serverName}_get_prompt`,
            description: `Get an MCP prompt from ${serverName} by name.`,
            schema: z.object({
              name: z.string().describe('Prompt name returned by the list prompts utility.'),
              arguments: z.record(z.any()).optional().describe('Prompt arguments.'),
            }),
          },
        ),
      );
    }

    return tools;
  }

  private safeResult(serverName: string, action: string, result: unknown): string {
    const serialized = JSON.stringify(result, null, 2) ?? String(result);
    const scan = this.riskScanner.scanDescription(`mcp_${serverName}_${action}`, serialized);
    if (scan.suspicious) {
      return `Blocked by MCP content safety: ${scan.reasons.join('; ')}`;
    }
    return serialized;
  }
}
