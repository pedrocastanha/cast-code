# Core Module

## Overview
The central orchestration engine of Cast Code. Contains DeepAgentService (main AI agent loop), PlanModeService (structured planning), PromptLoaderService, and PromptClassifierService.

## Role in System
This is the brain of Cast Code. `DeepAgentService` manages the conversation loop with LLMs, handles message history, tool execution, context injection, and summarization. `PlanModeService` determines when complex requests need structured planning and generates step-by-step plans. Core imports and coordinates most other modules.

## Dependencies
- **Depends on**: CommonModule, AgentsModule, SkillsModule, ToolsModule (forwardRef), McpModule, ProjectModule, MemoryModule (forwardRef), MentionsModule, PermissionsModule, SnapshotModule, StatsModule, ReplayModule, WatcherModule
- **Used by**: REPL, Rooms, Tasks, Kanban, Remote
- **External deps**: `deepagents` (createDeepAgent, FilesystemBackend), `@langchain/core` (messages, chat models), `child_process` (execSync)

## Key Services/Providers
| Service | Purpose |
|---|---|
| `DeepAgentService` | Main AI agent loop — manages messages, tool execution, context injection, history summarization, file watcher integration, and rooms event bus. 1293 lines. |
| `PlanModeService` | Detects complex requests and generates structured plans with steps, dependencies, and time estimates. Uses LLM-based analysis for borderline cases. |
| `PromptLoaderService` | Loads prompt templates from `src/prompts/` directory. |
| `PromptClassifierService` | Classifies incoming user prompts to determine routing (e.g., config command vs. task vs. general chat). |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `Plan` | Generated plan: title, overview, steps[], complexity, shouldPlan |
| `PlanStep` | Individual plan step: id, description, files[], estimatedTime?, dependencies?[] |

## Coding Standards & Patterns
- **Central hub pattern**: Core imports almost every module. It's the orchestration layer. Other modules should NOT import Core unless absolutely necessary (and even then, use forwardRef).
- **Lazy context injection**: `DeepAgentService` caches system prompts and only rebuilds them when context changes (project structure, skills, MCP servers).
- **Message summarization**: When message count exceeds `SUMMARIZE_THRESHOLD` (40), older messages are summarized via LLM, keeping the most recent 10 (`KEEP_RECENT`).
- **File watcher integration**: Subscribes to `FILE_CHANGE_EVENT` and marks context for lazy refresh — avoids rebuilding prompts on every file change.
- **Tool separation**: Distinguishes between "base tools" (filesystem, shell, search) and "extra tools" (skills, MCP). Base tools are always available; extra tools are agent-specific.
- **deepagents integration**: Uses `createDeepAgent` from the `deepagents` package as the underlying agent framework with `FilesystemBackend`.
- **Instance/room awareness**: Maintains `instanceId`, `roomId`, and `currentAgentId` for multi-agent room scenarios.

## Business Rules
- Agent execution always uses relative paths — absolute paths starting with `/` or `~` are forbidden in system prompts.
- Snapshot service is called before agent writes to create copy-on-write backups.
- Stats service tracks every LLM call for cost monitoring.
- Replay service records all sessions for playback.
- Permission service gates dangerous tool calls (shell commands, file writes).
- The `plan mode` entry is determined by complexity heuristics (multiple file references, sequential keywords, complexity words) with LLM fallback for ambiguous cases.

## Circular Dependencies
- `CoreModule` → `forwardRef(ToolsModule)` — core uses tools, tools need core for task execution
- `CoreModule` → `forwardRef(MemoryModule)` — core uses memory, memory may need core for certain operations
- `CoreModule` exports `MentionsModule`, `McpModule`, `AgentsModule`, `SkillsModule` — convenience re-exports for consumers of Core

## Context Injection Architecture (Deep Dive)

### How the Main Agent Sees Skills, Sub-Agents, and Tools

The `DeepAgentService` injects context into the agent through a **layered system prompt** built at initialization and on each chat turn. Here's the complete flow:

#### 1. Initialization Phase (`initialize()`)

```
initialize()
  ├── Load project → ProjectLoaderService detects .cast/ directory
  ├── Load project-specific agents → AgentRegistryService.loadProjectAgents()
  ├── Load project-specific skills → SkillRegistryService.loadProjectSkills()
  ├── Connect MCP servers → McpRegistryService.connectAll()
  ├── Resolve sub-agent definitions → AgentRegistryService.getSubagentDefinitions()
  │   └── Each agent resolves its declared skills → SkillRegistryService.getToolsForSkills()
  │       └── Each skill declares tool names → ToolsRegistryService.getTools(names)
  ├── Collect all tools → ToolsRegistryService.getAllTools()
  ├── Filter extra tools → Exclude DEEPAGENT_BUILTIN_TOOLS (read_file, write_file, edit_file, glob, grep, ls, write_todos, task)
  ├── Collect MCP tools → McpRegistryService.getAllMcpTools()
  ├── Collect MCP discovery tools → McpRegistryService.getDiscoveryTools()
  ├── Build base prompt → buildBasePrompt(allTools, subagents)
  └── Create DeepAgent → createDeepAgent({ model, systemPrompt, tools: [...extraTools, ...mcpTools, ...mcpDiscoveryTools], subagents })
```

#### 2. How Skills Reach the Agent

Skills are **NOT injected directly** into the agent's tool list at the main level. Instead:

- **Skills belong to sub-agents**: Each agent definition (`.md` file with frontmatter) declares a `skills: string[]` array.
- When `AgentRegistryService.resolveAgent()` runs, it:
  1. Looks up each skill name via `SkillLoaderService.getSkill(name)`
  2. Resolves skill tool names → `ToolsRegistryService.getTools(skill.tools)` → returns `StructuredTool[]`
  3. Appends skill guidelines to the sub-agent's system prompt
  4. The resulting `tools: StructuredTool[]` array is passed to the sub-agent's `SubagentDefinition`

- **For the main agent**: Skills are only mentioned by name in the system prompt:
  ```
  # Domain Knowledge
  You have N skills available. Use list_skills to discover them and read_skill(name) to load full content.
  ```
  The main agent discovers skills through the **`list_skills`** and **`read_skill`** tools (registered in ToolsModule), not through direct tool injection.

#### 3. How Sub-Agents Reach the Agent

Sub-agents are passed directly to `createDeepAgent()` via the `subagents` parameter:

```typescript
const subagents = this.agentRegistry.getSubagentDefinitions(projectContext);
// Returns SubagentDefinition[] with: { name, description, systemPrompt, tools, mcp }

this.agent = createDeepAgent({
  model: this.model,
  systemPrompt,
  tools: [...extraTools, ...mcpTools, ...mcpDiscoveryTools],
  subagents,  // ← passed here
  backend: () => new FilesystemBackend({ rootDir: this.projectRoot }),
});
```

Each `SubagentDefinition` contains:
- `name`: Agent identifier (e.g., "frontend", "backend", "reviewer")
- `description`: What the agent does (shown to main agent for delegation decisions)
- `systemPrompt`: The agent's own system prompt (includes skill guidelines + tool list)
- `tools`: `StructuredTool[]` resolved from the agent's declared skills + MCP connections
- `mcp`: Array of MCP server names the agent has access to

#### 4. How Tools Reach the Agent

Tools are split into **three tiers**:

| Tier | Tools | How injected |
|---|---|---|
| **Built-in** | read_file, write_file, edit_file, glob, grep, ls, write_todos, task | Handled by deepagents framework, NOT in tool array |
| **Extra** | All tools from ToolsModule EXCEPT built-in | Passed in `tools` array to createDeepAgent |
| **MCP** | Tools from connected MCP servers | Passed in `tools` array to createDeepAgent |

The `DEEPAGENT_BUILTIN_TOOLS` set defines which tools the deepagents framework handles natively. Everything else goes through the `tools` array.

#### 5. System Prompt Construction

The system prompt is built in **two stages**:

**Stage 1 — Base Prompt** (`buildBasePrompt`):
- Loaded from `src/prompts/defaults/base.md`
- Replaces `{{tool_names}}` with comma-separated list of extra tool names
- Replaces `{{language_instruction}}` with i18n-based language directive
- Replaces `{{subagents_section}}` with formatted list of sub-agents (name + description)
- Appends git status (branch, changes, recent commits)

**Stage 2 — Contextual Prompt** (`buildContextualPrompt`, called per message):
- Starts with the base prompt
- Adds prompt layers from `PromptClassifierService.classify()` based on message context:
  - `mcp` layer: Lists connected MCP servers with status and tool count
  - `project` layer: Project structure summary
  - `memory` layer: Cached memory entries from previous sessions
  - `mentions` layer: File/directory contents from @-mentions
- Appends environment info, project context, and memory

If the contextual prompt differs from the cached one, the agent is **re-created** with the new system prompt:
```typescript
if (contextualPrompt !== this.cachedSystemPrompt) {
  this.cachedSystemPrompt = contextualPrompt;
  this.agent = createDeepAgent({
    model: this.model,
    systemPrompt: contextualPrompt,
    tools: [...this.cachedExtraTools, ...this.cachedMcpTools, ...this.cachedMcpDiscoveryTools],
    subagents: this.cachedSubagents,
    backend: () => new FilesystemBackend({ rootDir: this.projectRoot }),
  });
}
```

#### 6. buildSystemPrompt (Full Version)

The `buildSystemPrompt()` method (used in some code paths) constructs a comprehensive system prompt with these sections:
1. Language instruction
2. Agent identity and tone
3. Project overview (structure)
4. **CRITICAL RULES**: Never guess, read before edit, minimal changes, tool discipline
5. **Available Tools**: Categorized list (built-in, MCP, discovery)
6. **Task Management & Kanban**: Protocol for task_create/task_update
7. **Memory**: Protocol for memory_write/memory_read
8. **MCP Integration Protocol**: When to use MCP vs built-in, server status, naming convention
9. **Planning Protocol**: When/how to enter plan mode, autonomous execution rules
10. **Sub-Agent Orchestration**: Available sub-agents, when to delegate, delegation patterns
11. **Execution Protocol**: Exploration, implementation, tool chain patterns, thoroughness rules
12. **Autonomous Decision-Making**: Decision matrix, self-correction
13. **Git Safety Protocol**
14. **Response Style**
15. **User Mentions**: How to handle `<file>`, `<directory>`, `<url>`, `<git>` tags
16. **Domain Knowledge**: Skills count + list_skills/read_skill instruction
17. **Environment**: Working directory, platform, Node.js version, git status
18. **Context Prompt**: Project context from ProjectContextService
19. **Auto Memory**: Previous session memories from LTMService

## Working on This Module
- **DeepAgentService is large** (1293 lines). It's the most critical file. Key sections: constructor (DI), agent initialization, message handling, tool execution, summarization, context refresh.
- **Performance matters**: The caching system (`cachedSystemPrompt`, `cachedBasePrompt`, etc.) exists to avoid expensive prompt rebuilding on every turn. When modifying, preserve caching behavior.
- **Test carefully**: Changes here affect the entire AI interaction flow. Use the REPL for manual testing before committing.
- **Message history**: `BaseMessage[]` from LangChain. SystemMessage, HumanMessage, AIMessage. The order matters.
- **Rooms integration**: DeepAgentService publishes to `RoomEventBusService` and uses `LTMService` for long-term memory in room scenarios.
- **Plan mode flow**: `shouldEnterPlanMode()` → heuristics → LLM check → `generatePlan()` → structured output with steps and dependencies.
