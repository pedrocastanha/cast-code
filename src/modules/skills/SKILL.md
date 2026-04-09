# Skills Module

## Overview
Discovers, loads, and registers skill definitions from markdown files. Skills provide guidelines and tool access that extend agent capabilities. Mirror pattern of the Agents module.

## Role in System
Skills are reusable capability packages that agents can request via their frontmatter `skills` array. Each skill is a markdown file with guidelines and a list of required tools. The Skills module loads these definitions, resolves tool dependencies, and provides tool access to agents that declare the skill.

## Dependencies
- **Depends on**: ToolsModule (forwardRef — for tool resolution)
- **Used by**: AgentsModule (agent skill resolution), CoreModule, REPL
- **External deps**: `path`, Common (MarkdownParserService)

## Key Services/Providers
| Service | Purpose |
|---|---|
| `SkillLoaderService` | Scans `definitions/` directory (both `general/` and `specialized/` subdirs), parses markdown files with frontmatter, loads skill definitions into a Map. Supports `loadFromPath()` for custom paths. |
| `SkillRegistryService` | Resolves skill definitions into tools. Provides `getToolsForSkills()`, `getIsolatedToolsForSkills()`, and `getGuidelinesForSkills()` for agent resolution. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `SkillFrontmatter` | YAML frontmatter: name, description, tools[] |
| `SkillDefinition` | Internal representation: name, description, tools[], guidelines (full markdown content) |
| `ResolvedSkill` | Fully resolved skill with tools array (StructuredTool[]) and guidelines string |

## Coding Standards & Patterns
- **Mirror of Agents module**: Same architecture — loader + registry, markdown DSL, definitions directory, frontmatter parsing. The pattern is intentional for consistency.
- **Two-tier definitions**: `definitions/general/` for universal skills, `definitions/specialized/` for domain-specific skills.
- **Tool resolution**: Skills declare their required tools in frontmatter. The registry resolves these tool names to actual `StructuredTool` instances.
- **Isolated vs shared tools**: `getIsolatedToolsForSkills()` returns a sandboxed tool set (for untrusted agents); `getToolsForSkills()` returns the standard tool set.
- **Guidelines injection**: `getGuidelinesForSkills()` returns the full markdown content of all requested skills, concatenated and appended to the agent's system prompt.
- **Dual key loading**: Skills are registered under both their path and their name, allowing lookup by either.

## Business Rules
- Skills with unknown tool names fall back gracefully — the registry logs a warning.
- Isolated tool access is used when `resolveAgent()` is called with `isolated=true`.
- Skill guidelines are appended to the agent's system prompt under a `# Skills Guidelines` section.
- Loading from a custom path merges with existing skills (same behavior as AgentLoaderService).

## Circular Dependencies
- `SkillsModule` → `forwardRef(ToolsModule)` — skills need tools, tools need skills for tool resolution
- `CoreModule` imports `SkillsModule`; `ToolsModule` imports `forwardRef(SkillsModule)`

## Working on This Module
- **Adding a new skill**: Create a `.md` file in `definitions/general/` (universal) or `definitions/specialized/` (domain-specific). Include frontmatter with `name`, `description`, and `tools` array. The file content becomes the guidelines.
- **Frontmatter fields**: `name` and `description` are required. `tools` is an array of tool names (must match registered tool names in ToolsModule).
- **Debugging skill loading**: Check `skill-loader.service.ts` — `loadSkills()` parses all `.md` files. Use the registry's `getAllSkills()` to inspect loaded skills.
- **Tool resolution is key**: `SkillRegistryService` is where skill tool names are resolved to actual tool implementations. If a skill's tools aren't working, check the tool name matches.
- **Same patterns as Agents**: If you understand the Agents module, this module works identically. Loader parses markdown → Registry resolves dependencies.
