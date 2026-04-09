# REPL Module

## Overview
Interactive CLI REPL — the main user entry point for Cast Code. 855 lines + 14 command handlers. Handles user input, command routing, agent interaction, and output formatting.

## Role in System
This is the primary user interface. Users interact with Cast Code through the REPL — typing natural language prompts, slash commands, or @-mentions. The REPL routes input to the appropriate handler (DeepAgentService for AI tasks, command services for slash commands), manages the interaction loop, and formats output with themes and icons.

## Dependencies
- **Depends on**: ConfigModule, CoreModule, ToolsModule, GitModule, AgentsModule, SkillsModule, McpModule, ProjectModule, MemoryModule, KanbanModule, RemoteModule, PermissionsModule, SnapshotModule, StatsModule, ReplayModule, VaultModule, RoomsModule
- **Used by**: Entry point — users interact through REPL. No other module depends on REPL.
- **External deps**: `readline` (Node.js), terminal styling libraries, spinner libraries

## Key Services/Providers
| Service | Purpose |
|---|---|
| `ReplService` | Main REPL loop — reads input, routes to handlers, manages abort, formats output. 855 lines. |
| `WelcomeScreenService` | Displays welcome screen on startup with project info and quick tips. |
| `ReplCommandsService` | General REPL commands: `/help`, `/exit`, `/clear`, etc. |
| `GitCommandsService` | Git-related commands: `/commit`, `/pr`, `/review`, `/release-notes`. |
| `AgentCommandsService` | Agent management: `/agent`, `/agents`, `/list-agents`. |
| `McpCommandsService` | MCP server management: `/mcp`, `/mcp-connect`, `/mcp-disconnect`. |
| `ProjectCommandsService` | Project commands: `/project`, `/analyze`. |
| `SnapshotCommandsService` | Snapshot management: `/snapshot`, `/rollback`. |
| `StatsCommandsService` | Token/cost stats: `/stats`, `/cost`. |
| `ReplayCommandsService` | Session replay: `/record`, `/replay`. |
| `VaultCommandsService` | Code snippet storage: `/vault`. |
| `BridgeCommandsService` | Room bridge commands for multi-agent communication. |
| `RoomsCommandsService` | Room management commands. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `Colors` | Terminal color constants from `utils/theme.ts` |
| `Icons` | Unicode icon constants from `utils/theme.ts` |

## Coding Standards & Patterns
- **Command routing**: Slash commands (`/command`) are routed to specific command handler services. Each command group has its own service in `services/commands/`.
- **Smart input**: `SmartInput` class in `services/smart-input.ts` handles input processing — likely tab completion, history, or input validation.
- **Abort support**: `AbortController` allows users to cancel long-running AI tasks mid-execution.
- **Broadcast mode**: `isBroadcasting` flag for multi-agent room scenarios where input goes to all agents in a room.
- **Spinner for async operations**: Shows a spinner timer during long AI processing to indicate activity.
- **Theme system**: `utils/theme.ts` provides colors and icons for consistent terminal output. `utils/prompts-with-esc.ts` handles escape sequences for readline.
- **Processing lock**: `isProcessing` flag prevents overlapping command execution.

## Business Rules
- Input without `/` prefix goes to DeepAgentService for AI processing.
- Commands starting with `/` are routed to the appropriate command handler.
- @-mentions in input are resolved before sending to the agent.
- Plan mode can be triggered for complex requests — the REPL shows the plan and asks for confirmation.
- Broadcasting mode sends input to all agents in a room simultaneously.

## Circular Dependencies
None. REPL imports many modules but no module imports REPL (it's the top-level consumer).

## Working on This Module
- **Large file alert**: `repl.service.ts` is 855 lines. It's the main interaction loop. Key sections: constructor (14+ command services injected), `start()` method, input processing, command routing, output formatting.
- **Adding commands**: Create a new command handler in `services/commands/{name}-commands.service.ts`, inject it into ReplService, add routing logic.
- **Theme customization**: Modify `utils/theme.ts` to change colors and icons used throughout the REPL.
- **Smart input**: `smart-input.ts` likely handles readline enhancements. Check it for tab completion, history navigation, and input validation.
- **Testing**: REPL is hard to unit test (interactive). Use manual testing for most changes. The `repl.service.spec.ts` file exists for basic unit tests.
- **Command organization**: 14 command handler services keep the code organized. Don't put command logic directly in ReplService — delegate to the appropriate command service.
