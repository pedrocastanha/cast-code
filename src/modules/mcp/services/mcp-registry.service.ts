import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { McpClientService } from './mcp-client.service';
import { McpConfig, McpServerSummary } from '../types';
import { getTemplate } from '../catalog/mcp-templates';
import { McpRiskScannerService } from './mcp-risk-scanner.service';
import { McpApprovalPolicyService } from './mcp-approval-policy.service';
import { McpCapabilityService } from './mcp-capability.service';

@Injectable()
export class McpRegistryService implements OnModuleDestroy {
  private configs: Map<string, McpConfig> = new Map();
  private activeEnvironmentId: string | null = null;
  private activeEnvironmentServers: Set<string> | null = null;
  private activeEnvironmentScopeStrict = false;

  constructor(
    private readonly mcpClient: McpClientService,
    private readonly riskScanner: McpRiskScannerService,
    private readonly approvalPolicy: McpApprovalPolicyService,
    private readonly capabilityService: McpCapabilityService,
  ) {}

  onModuleDestroy() {
    this.mcpClient.disconnectAll();
  }

  registerMcp(name: string, config: McpConfig) {
    const previous = this.configs.get(name);
    this.configs.set(name, config);

    if (previous && !this.isSameConfig(previous, config) && this.mcpClient.getStatus(name) === 'connected') {
      this.mcpClient.disconnect(name);
    }
  }

  getConfig(name: string): McpConfig | undefined {
    return this.configs.get(name);
  }

  getAuthUrl(name: string): string | undefined {
    return this.mcpClient.getAuthUrl(name);
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
    if (!this.isServerInActiveScope(name)) {
      return [];
    }
    const mcpTools = this.mcpClient.getTools(name);
    const capabilities = typeof (this.mcpClient as any).getCapabilities === 'function'
      ? this.mcpClient.getCapabilities(name)
      : { tools: true, resources: false, prompts: false };
    const utilityTools = this.capabilityService.getUtilityTools(name, capabilities);

    const registeredTools = mcpTools.flatMap((mcpTool) => {
      const scan = this.riskScanner.scanDescription(`${name}_${mcpTool.name}`, mcpTool.description);
      if (scan.suspicious) {
        return [];
      }

      const schema = this.convertSchemaToZod(mcpTool.inputSchema);

      return [tool(
        async (input) => {
          const policy = this.approvalPolicy.evaluateTool(name, mcpTool.name);
          if (!policy.allowed) {
            return `Blocked by MCP policy (${policy.mode}): ${policy.reason ?? mcpTool.name}`;
          }

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
      )];
    });

    return [...registeredTools, ...utilityTools];
  }

  getAllMcpTools(): StructuredTool[] {
    const allTools: StructuredTool[] = [];

    for (const name of this.configs.keys()) {
      if (!this.isServerInActiveScope(name)) {
        continue;
      }
      allTools.push(...this.getMcpTools(name));
    }

    return allTools;
  }

  private convertSchemaToZod(schema: Record<string, unknown>): z.ZodObject<any> {
    if (!schema || typeof schema !== 'object' || !this.isRecord(schema.properties)) {
      return z.object({}).passthrough();
    }

    const properties = schema.properties as Record<string, any>;
    const required = Array.isArray(schema.required) ? schema.required as string[] : [];
    const zodShape: Record<string, z.ZodTypeAny> = {};

    for (const [key, prop] of Object.entries(properties)) {
      let zodType = this.convertPropertyToZod(prop);

      if (this.isRecord(prop) && typeof prop.description === 'string') {
        zodType = zodType.describe(prop.description);
      }

      if (!required.includes(key)) {
        zodType = zodType.optional();
      }

      zodShape[key] = zodType;
    }

    return z.object(zodShape);
  }

  private convertPropertyToZod(prop: any): z.ZodTypeAny {
    if (!this.isRecord(prop)) {
      return z.any();
    }

    if (Array.isArray(prop.anyOf)) {
      const nonNull = prop.anyOf.filter((candidate: any) => candidate?.type !== 'null');
      const hasNull = nonNull.length !== prop.anyOf.length;
      const base = nonNull.length === 0
        ? z.any()
        : nonNull.length === 1
        ? this.convertPropertyToZod(nonNull[0])
        : z.union(nonNull.map((candidate: any) => this.convertPropertyToZod(candidate)) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
      return hasNull ? base.nullable() : base;
    }

    const type = Array.isArray(prop.type) ? prop.type.find((item: string) => item !== 'null') : prop.type;
    const nullable = Array.isArray(prop.type) && prop.type.includes('null');
    let zodType: z.ZodTypeAny;

    switch (type) {
    case 'string':
      zodType = z.string();
      break;
    case 'number':
    case 'integer':
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

    return nullable ? zodType.nullable() : zodType;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private isSameConfig(left: McpConfig, right: McpConfig): boolean {
    return left.type === right.type
      && left.endpoint === right.endpoint
      && left.command === right.command
      && this.isSameStringArray(left.args, right.args)
      && this.isSameStringRecord(left.env, right.env);
  }

  private isSameStringArray(left: string[] | undefined, right: string[] | undefined): boolean {
    const leftValues = left ?? [];
    const rightValues = right ?? [];
    return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
  }

  private isSameStringRecord(left: Record<string, string> | undefined, right: Record<string, string> | undefined): boolean {
    const leftEntries = Object.entries(left ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const rightEntries = Object.entries(right ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return leftEntries.length === rightEntries.length
      && leftEntries.every(([key, value], index) => key === rightEntries[index][0] && value === rightEntries[index][1]);
  }

  getServerSummaries(): McpServerSummary[] {
    return this.getServerSummariesForScope(true);
  }

  getUnscopedServerNames(): string[] {
    return Array.from(this.configs.keys());
  }

  private getServerSummariesForScope(useActiveScope: boolean): McpServerSummary[] {
    const summaries: McpServerSummary[] = [];

    for (const [name, config] of this.configs) {
      if (useActiveScope && !this.isServerInActiveScope(name)) {
        continue;
      }
      const status = this.mcpClient.getStatus(name);
      const tools = this.mcpClient.getTools(name);
      const template = getTemplate(name);
      const quarantinedTools = tools
        .map((mcpTool) => {
          const scan = this.riskScanner.scanDescription(`${name}_${mcpTool.name}`, mcpTool.description);
          return scan.suspicious
            ? { name: `${name}_${mcpTool.name}`, warning: scan.warning ?? 'Tool quarantined.', reasons: scan.reasons }
            : null;
        })
        .filter((item): item is { name: string; warning: string; reasons: string[] } => item !== null);
      const safeTools = tools.filter((mcpTool) => !this.riskScanner.scanDescription(`${name}_${mcpTool.name}`, mcpTool.description).suspicious);

      summaries.push({
        name,
        transport: config.type,
        status,
        toolCount: safeTools.length,
        toolNames: safeTools.map(t => `${name}_${t.name}`),
        toolDescriptions: safeTools.map(t => ({
          name: `${name}_${t.name}`,
          description: t.description,
        })),
        environments: template?.environments,
        risk: template?.risk,
        auth: template?.auth,
        mutationPolicy: template?.mutationPolicy,
        capabilities: typeof (this.mcpClient as any).getCapabilities === 'function'
          ? this.mcpClient.getCapabilities(name)
          : { tools: true, resources: false, prompts: false },
        quarantinedTools,
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

  async addAndConnect(name: string, config: McpConfig): Promise<boolean> {
    this.registerMcp(name, config);
    return await this.connectMcp(name);
  }

  isConnected(name: string): boolean {
    return this.mcpClient.getStatus(name) === 'connected';
  }

  getConnectedServers(): string[] {
    const summaries = this.getServerSummaries();
    return summaries
      .filter(s => s.status === 'connected')
      .map(s => s.name);
  }

  setActiveEnvironmentScope(
    environmentId: string,
    serverNames: string[],
    options: { strict?: boolean } = {},
  ): void {
    this.activeEnvironmentId = environmentId;
    this.activeEnvironmentServers = new Set(serverNames);
    this.activeEnvironmentScopeStrict = options.strict ?? false;
  }

  clearActiveEnvironmentScope(): void {
    this.activeEnvironmentId = null;
    this.activeEnvironmentServers = null;
    this.activeEnvironmentScopeStrict = false;
  }

  private isServerInActiveScope(name: string): boolean {
    if (!this.activeEnvironmentId || !this.activeEnvironmentServers) {
      return true;
    }
    const template = getTemplate(name);
    if (this.activeEnvironmentScopeStrict) {
      return this.activeEnvironmentServers.has(name);
    }
    return this.activeEnvironmentServers.has(name)
      || Boolean(template?.environments?.includes(this.activeEnvironmentId));
  }
}
