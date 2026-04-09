# Agents Module

## Overview
Discovers, loads, and registers AI agent definitions from markdown files. Each agent is a markdown file with YAML frontmatter defining its name, description, model, temperature, skills, and MCP servers.

## Role in System
The Agents module is the central agent discovery mechanism. It scans `src/modules/agents/definitions/` for `.md` files, parses their frontmatter, and produces `ResolvedAgent` objects with resolved tools (from skills + MCP) and system prompts. Core and REPL depend on this to instantiate agents.

## Dependencies
- **Depends on**: SkillsModule, ToolsModule (forwardRef), McpModule, Common (MarkdownParserService)
- **Used by**: Core (DeepAgentService), REPL, Rooms
- **External deps**: `path`, built-in Node.js modules

## Key Services/Providers
| Service | Purpose |
|---|---|
| `AgentLoaderService` | Scans `definitions/` directory, parses markdown files with frontmatter, loads agent definitions into a Map. Supports `loadFromPath()` for custom paths. |
| `AgentRegistryService` | Resolves agent definitions into `ResolvedAgent` objects by wiring up skills → tools, MCP → tools, and assembling the final system prompt with tool names and guidelines. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `AgentFrontmatter` | YAML frontmatter schema: name, description, model?, temperature?, skills[], mcp?[] |
| `AgentDefinition` | Internal representation: name, description, model, temperature, skills[], mcp[], systemPrompt |
| `ResolvedAgent` | Fully resolved agent with tools array (StructuredTool[]), assembled system prompt, and MCP references |
| `SubagentDefinition` | Lightweight subagent spec: name, description, systemPrompt, tools[], mcp?[] |

## Coding Standards & Patterns
- **Markdown DSL**: Agents are defined as `.md` files in `definitions/`. The file content becomes the system prompt; frontmatter provides metadata.
- **Two-phase loading**: `AgentLoaderService` loads raw definitions → `AgentRegistryService` resolves them (injects tools, skills guidelines, tool name restrictions).
- **Fallback tools**: When skill tools are unavailable, falls back to `read_file`, `glob`, `grep`, `ls`.
- **Tool restriction enforcement**: Resolved system prompts include explicit instructions: "You have access to these tools ONLY. Do NOT attempt to use tools not in this list."
- **Merging on custom path load**: `loadFromPath()` merges with existing agents (union of skills/mcp, replaces system prompt).
- **Path convention**: Agent definition files are in `definitions/` — one `.md` per agent (e.g., `architect.md`, `coder.md`, `reviewer.md`).

## Business Rules
- Agent names must be unique; loading from a custom path with a duplicate name merges skills/mcp arrays and replaces the system prompt.
- Skills listed in agent frontmatter are resolved to tools via `SkillRegistryService`. Unknown skills trigger a warning and fallback to default tools.
- MCP servers referenced in frontmatter are resolved via `McpRegistryService`.
- All resolved agents get execution rules appended: use relative paths, execute completely, re-read files after writing.
- The `isolated` parameter on `resolveAgent()` controls whether isolated tool sets are used (for sandboxed execution).

## Circular Dependencies
- `AgentsModule` → `forwardRef(ToolsModule)` — agents need tools, tools need agents for tool resolution
- `CoreModule` imports `AgentsModule`; `AgentsModule` does not import `CoreModule` (no cycle)

## Working on This Module
- **Adding a new agent**: Create a `.md` file in `definitions/` with proper frontmatter. The agent will be auto-loaded on module init.
- **Frontmatter fields**: `name` and `description` are required. `model` and `temperature` are optional (fall back to `DEFAULT_MODEL`/`DEFAULT_TEMPERATURE`). `skills` and `mcp` default to empty arrays.
- **Debugging agent loading**: Check `agent-loader.service.ts` — the `loadAgents()` method iterates all `.md` files in `definitions/`. Use `getAgent(name)` and `getAllAgents()` to inspect loaded agents.
- **Agent resolution is where the magic happens**: `resolveAgent()` in `agent-registry.service.ts` is the key method. It assembles tools from skills + MCP, appends skill guidelines, adds tool name restrictions, and appends execution rules.
- **Pattern mirror of Skills module**: Agents and Skills modules follow the same architectural pattern (loader + registry, markdown DSL, definitions directory).
