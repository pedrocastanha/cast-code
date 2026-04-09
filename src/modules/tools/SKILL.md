# Tools Module

## Overview
Tool registry providing filesystem operations, shell execution, search, discovery, and impact analysis as LangChain StructuredTools for agent use.

## Role in System
This is the primary tool provider for agents. Exposes `read_file`, `write_file`, `edit_file`, `shell`, `glob`, `grep`, `ls`, and discovery tools as LangChain StructuredTools. All agents' tool access goes through this module (directly or via Skills/Agents resolution).

## Dependencies
- **Depends on**: PermissionsModule, TasksModule (forwardRef), MemoryModule (forwardRef), SkillsModule (forwardRef), AgentsModule (forwardRef), VaultModule
- **Used by**: AgentsModule, SkillsModule, CoreModule, and indirectly all agent execution
- **External deps**: `child_process` (shell execution), file system, search libraries

## Key Services/Providers
| Service | Purpose |
|---|---|
| `FilesystemToolsService` | File operations: `read_file`, `write_file`, `edit_file`. The core file manipulation tools used by every agent. |
| `ShellToolsService` | Shell command execution: `shell` tool. Gates behind permission system for safety. |
| `SearchToolsService` | Search operations: `grep`, `glob`. Content and filename searching. |
| `DiscoveryToolsService` | Discovery operations: `ls`, directory listing, file info. Helps agents explore the project structure. |
| `ToolsRegistryService` | Central tool registry — collects all tools from the above services, provides `getTools()` and `getIsolatedTools()` lookup by name. |
| `ImpactAnalysisService` | Analyzes the impact of proposed changes — which files, modules, and tests are affected. Used in planning and review workflows. |

## Key Types/Interfaces
No dedicated types file. Tools are LangChain `StructuredTool` instances with defined input schemas.

## Coding Standards & Patterns
- **Tool groups**: Tools are organized by category (filesystem, shell, search, discovery) with each category as its own service.
- **Registry pattern**: `ToolsRegistryService` collects all tools and provides lookup by name. Supports both standard and isolated tool sets.
- **Isolated tools**: `getIsolatedTools()` returns a sandboxed subset — used for untrusted or restricted agent execution.
- **Heavy forwardRef**: Uses forwardRef with 4 modules (Tasks, Memory, Skills, Agents) — this module is at the center of many dependency cycles.
- **Permission gating**: Shell and write operations go through the Permission service before execution.
- **Impact analysis**: Cross-references changes with project structure to identify affected modules, tests, and dependencies.

## Business Rules
- File tools use relative paths only — absolute paths are rejected.
- Shell execution always requires permission check.
- Write operations create snapshots before modifying files (via SnapshotModule integration).
- Impact analysis runs before plan execution to warn about potential side effects.
- Isolated tool sets exclude dangerous tools (shell, force write) for sandboxed agent execution.

## Circular Dependencies
- `ToolsModule` → `forwardRef(TasksModule)` — tools used by tasks, tasks use tools
- `ToolsModule` → `forwardRef(MemoryModule)` — tools may interact with memory, memory provides tools
- `ToolsModule` → `forwardRef(SkillsModule)` — skills declare tool dependencies, tools expose skill capabilities
- `ToolsModule` → `forwardRef(AgentsModule)` — agents use tools, tools are resolved for agents

## Working on This Module
- **Adding a new tool**: Create it in the appropriate service (or a new service), register it via `ToolsRegistryService`. Follow the LangChain `StructuredTool` pattern.
- **File tools are critical**: `FilesystemToolsService` provides the most-used tools. Test thoroughly — bugs here cause data loss.
- **Shell safety**: `ShellToolsService` is the most dangerous. Ensure all paths go through the permission system.
- **Impact analysis**: `ImpactAnalysisService` is unique — it doesn't expose tools but provides analysis used by other modules.
- **Registry debugging**: If a tool isn't found, check `ToolsRegistryService.getTools()` output. The tool must be registered in the registry to be accessible.
- **forwardRef necessity**: The circular dependencies are real — this module is genuinely entangled with Agents, Skills, Memory, and Tasks. Don't try to remove forwardRef without a major refactor.
