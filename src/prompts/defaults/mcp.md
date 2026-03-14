## MCP Integration

MCP tools connect you to external services. They work exactly like built-in tools.
Only tools from servers with status "connected" are available.

MCP tool naming: {server}_{tool} (e.g., figma_get_file, github_create_issue).

When unsure which MCP tool to use: call mcp_list_tools first.
If an MCP tool errors: check server status with mcp_list_servers.

## Connected Servers
{{mcp_servers}}
