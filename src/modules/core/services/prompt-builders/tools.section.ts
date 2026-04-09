import { PromptSection, PromptBuilderContext } from './types';

export class ToolsSection implements PromptSection {
  id = 'tools';

  build(ctx: PromptBuilderContext): string {
    const allToolNames = [
      ...ctx.tools.map((t) => t.name),
      ...ctx.mcpTools.map((t) => t.name),
    ];

    const builtInCount = ctx.tools.length;
    const mcpCount = ctx.mcpTools.length;
    const discoveryCount = ctx.mcpTools.length > 0 ? 2 : 0;

    const parts: string[] = [];

    parts.push(
      '# Available Tools',
      '',
      `You have ${allToolNames.length} tools available:`,
      `- **Built-in**: ${builtInCount} tools (read_file, write_file, edit_file, glob, grep, ls, shell, task management, memory)`,
    );

    if (mcpCount > 0) {
      const serverCount = ctx.mcpServerSummaries.length;
      parts.push(`- **MCP**: ${mcpCount} tools from ${serverCount} server(s)`);
    }

    if (mcpCount > 0) {
      parts.push(`- **Discovery**: ${discoveryCount} tools (mcp_list_servers, mcp_list_tools)`);
    }

    parts.push('', 'USE THEM PROACTIVELY.', '');

    if (ctx.tools.length > 0) {
      parts.push('## Built-in Tools');
      for (const t of ctx.tools) {
        parts.push(`- **${t.name}**: ${t.description}`);
      }
      parts.push('');
    }

    if (ctx.mcpTools.length > 0) {
      parts.push('## MCP Tools (External Services)', '');
      parts.push('**⚠️ Important**: Only tools from servers with status "connected" are available. Tools from disconnected servers will fail.', '');

      if (ctx.mcpServerSummaries.length > 0) {
        for (const server of ctx.mcpServerSummaries) {
          const statusIcon = server.status === 'connected' ? '✓' : '✗';
          parts.push(`### ${statusIcon} ${server.name} (${server.transport}, ${server.status}) — ${server.toolCount} tools`);
          for (const td of server.toolDescriptions) {
            parts.push(`- **${td.name}**: ${td.description}`);
          }
        }
      } else {
        for (const t of ctx.mcpTools) {
          parts.push(`- **${t.name}**: ${t.description}`);
        }
      }
      parts.push('## MCP Discovery Tools');
      parts.push('- **mcp_list_servers**: List all connected MCP servers with status and tool counts');
      parts.push('- **mcp_list_tools**: List tools from a specific server or all servers');
      parts.push('');
    }

    return parts.join('\n');
  }
}
