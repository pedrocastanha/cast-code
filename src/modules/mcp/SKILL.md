# MCP Module

## Overview
Model Context Protocol (MCP) client for connecting to MCP servers, OAuth authentication, and tool discovery from external MCP-compatible services.

## Role in System
Enables Cast Code to connect to external MCP servers (like GitHub, filesystem, database MCPs) and expose their tools as LangChain StructuredTools within the agent system. Provides OAuth support for authenticated MCP connections and maintains a registry of connected MCP servers.

## Dependencies
- **Depends on**: None (self-contained, but used by Agents, Skills, Core, Tools)
- **Used by**: AgentsModule (agent MCP tool resolution), ToolsModule, CoreModule, REPL
- **External deps**: MCP client SDK (likely `@modelcontextprotocol/sdk`), OAuth libraries

## Key Services/Providers
| Service | Purpose |
|---|---|
| `McpClientService` | Manages MCP server connections — connects to servers, discovers available tools, handles OAuth flows, and wraps MCP tools as LangChain StructuredTools. |
| `McpRegistryService` | Registry of connected MCP servers and their available tools. Provides lookup by server name and tool name. |
| `CastOAuthProvider` | Custom OAuth provider implementation for MCP server authentication flows. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `McpServerConfig` | Configuration for an MCP server: name, transport type, connection details |
| `McpToolDefinition` | Description of a tool exposed by an MCP server |
| `McpServerSummary` | Summarized info about a connected MCP server (used in system prompts) |

## Coding Standards & Patterns
- **MCP catalog**: `catalog/mcp-templates.ts` contains predefined MCP server templates for quick setup.
- **Tool wrapping**: MCP tools are wrapped as LangChain `StructuredTool` instances so they work seamlessly with the agent framework.
- **OAuth support**: `CastOAuthProvider` handles OAuth flows for MCP servers that require authentication.
- **Registry pattern**: Similar to AgentRegistry and SkillRegistry — maintains a Map of connected servers and their tools.
- **Connection lifecycle**: Services manage connection setup, teardown, and reconnection.

## Business Rules
- MCP servers are configured by the user and stored in config.
- Tools from MCP servers are available to agents that list the MCP server in their frontmatter `mcp` array.
- OAuth tokens are stored securely (likely in config or a separate credential store).
- MCP tool calls go through the permission system — dangerous MCP operations require user approval.

## Circular Dependencies
None. McpModule is a leaf module — it imports nothing from Cast Code modules.

## Working on This Module
- **Adding MCP server support**: Add templates to `catalog/mcp-templates.ts` for common servers.
- **OAuth flows**: `CastOAuthProvider` handles the OAuth dance. If a new OAuth provider is needed, extend this service.
- **Connection debugging**: Check `McpClientService` for connection logs. The registry service shows which servers are connected and what tools they expose.
- **MCP tools in agents**: Agents reference MCP servers by name in their frontmatter `mcp` array. The registry resolves these names to actual tool sets.
