import { PromptSection, PromptBuilderContext } from './types';

export class McpProtocolSection implements PromptSection {
  id = 'mcp-protocol';

  build(ctx: PromptBuilderContext): string {
    if (ctx.mcpTools.length === 0) return '';

    const parts: string[] = [
      '# MCP Integration Protocol',
      '',
      'MCP (Model Context Protocol) tools connect you to external services. They work exactly like built-in tools but reach outside the local filesystem.',
      '',
      '## Connected Servers',
    ];

    if (ctx.mcpServerSummaries.length > 0) {
      for (const s of ctx.mcpServerSummaries) {
        parts.push(`- **${s.name}** (${s.transport}, ${s.status}) — ${s.toolCount} tools`);
      }
    }

    parts.push(
      '',
      '## When to Use MCP vs Built-in',
      '| Need | Use |',
      '|------|-----|',
      '| Read/write local files | Built-in (read_file, write_file, edit_file) |',
      '| Search local codebase | Built-in (glob, grep) |',
      '| Run commands | Built-in (shell) |',
      '| Interact with external APIs/services | MCP tools |',
      '| Discover available MCP capabilities | mcp_list_servers, mcp_list_tools |',
      '',
      '## MCP Tool Naming Convention',
      'MCP tools follow the pattern `{server}_{tool}` (e.g., `figma_get_file`, `github_create_issue`).',
      'The prefix tells you which server provides the tool.',
      '',
      '## Discovery',
      '- Use **mcp_list_servers** to see which servers are connected and their status',
      '- Use **mcp_list_tools** to explore what tools a server provides (with descriptions)',
      '- When you\'re unsure which MCP tool to use, call mcp_list_tools first',
      '',
      '## Error Handling',
      '- If an MCP tool returns an error, check the server status with mcp_list_servers',
      '- MCP servers can disconnect — if a tool fails, the server may need reconnection',
      '- Report MCP errors to the user and suggest they check /mcp list in the REPL',
      '',
    );

    return parts.join('\n');
  }
}
