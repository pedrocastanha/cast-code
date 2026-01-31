# Cast Code

Multi-agent CLI system powered by [DeepAgents](https://github.com/langchain-ai/deepagentsjs) from LangChain.

## Installation

```bash
npm install -g cast-code
```

## Usage

```bash
cast
```

## Configuration

Set your OpenAI API key:

```bash
export OPENAI_API_KEY=sk-your-key-here
```

Or create `~/.cast/config.md`:

```markdown
---
model: gpt-4.1-nano
temperature: 0.1
apiKey: sk-your-key-here
---
```

## Project Configuration

Create a `.cast/` folder in your project root:

```
.cast/
├── context.md      # Project context and conventions
├── config.md       # Project-specific settings
├── agents/         # Agent overrides
│   └── frontend.md # Custom frontend agent config
└── mcp/
    └── figma.json  # Figma MCP configuration
```

### context.md Example

```markdown
---
name: my-project
stack:
  - typescript
  - react
  - tailwind
conventions:
  - camelCase for variables
  - PascalCase for components
---


## Structure
- src/components - React components
- src/pages - Page components
```

---

# Architecture

## Directory Structure

```
src/
├── main.ts                          # Application entry point
├── app.module.ts                    # Root NestJS module
├── common/                          # Shared utilities
│   ├── types/                       # Type definitions
│   │   ├── agent.types.ts           # Agent-related types
│   │   ├── skill.types.ts           # Skill-related types
│   │   ├── project.types.ts         # Project configuration types
│   │   ├── mcp.types.ts             # MCP protocol types
│   │   └── markdown.types.ts        # Markdown parser types
│   ├── constants/                   # Application constants
│   │   └── index.ts                 # Config paths, defaults, tool names
│   ├── services/
│   │   └── markdown-parser.service.ts  # YAML frontmatter + markdown parser
│   └── common.module.ts             # Global module exports
└── modules/
    ├── core/                        # Main orchestration
    ├── agents/                      # Subagent management
    ├── skills/                      # Skill definitions
    ├── tools/                       # LangChain tools
    ├── mcp/                         # MCP protocol client
    ├── project/                     # Project detection and loading
    └── repl/                        # CLI interface
```

---

# File Responsibilities

## Entry Points

| File | Responsibility |
|------|----------------|
| `src/main.ts` | Bootstrap NestJS app, start REPL, handle SIGINT |
| `src/app.module.ts` | Root module that imports CommonModule, CoreModule, ReplModule |

## Common Module

| File | Responsibility |
|------|----------------|
| `common/types/agent.types.ts` | `AgentDefinition`, `ResolvedAgent`, `SubagentDefinition` types |
| `common/types/skill.types.ts` | `SkillDefinition`, `ResolvedSkill` types |
| `common/types/project.types.ts` | `ProjectContext`, `ProjectConfig`, `ProjectInitResult` types |
| `common/types/mcp.types.ts` | `McpConfig`, `McpTool`, `McpConnection` types |
| `common/types/markdown.types.ts` | `ParsedMarkdown<T>` generic type for frontmatter parsing |
| `common/constants/index.ts` | `CAST_DIR`, `DEFAULT_MODEL`, `BUILT_IN_TOOLS` constants |
| `common/services/markdown-parser.service.ts` | Parses `.md` files with YAML frontmatter using gray-matter |
| `common/common.module.ts` | Global module that exports MarkdownParserService |

## Core Module

| File | Responsibility |
|------|----------------|
| `modules/core/services/config.service.ts` | Loads global config from `~/.cast/config.md`, manages API keys |
| `modules/core/services/deep-agent.service.ts` | Initializes DeepAgent, manages conversation, streams responses |
| `modules/core/core.module.ts` | Imports all modules, exports ConfigService and DeepAgentService |

## Agents Module

| File | Responsibility |
|------|----------------|
| `modules/agents/services/agent-loader.service.ts` | Loads agent definitions from `.md` files, supports project overrides |
| `modules/agents/services/agent-registry.service.ts` | Resolves agents with their skills and tools, builds system prompts |
| `modules/agents/agents.module.ts` | Imports SkillsModule and ToolsModule |
| `modules/agents/definitions/*.md` | 7 predefined agents: coder, architect, reviewer, frontend, backend, tester, devops |

## Skills Module

| File | Responsibility |
|------|----------------|
| `modules/skills/services/skill-loader.service.ts` | Loads skill definitions from `.md` files |
| `modules/skills/services/skill-registry.service.ts` | Resolves skills to LangChain tools, aggregates guidelines |
| `modules/skills/skills.module.ts` | Imports ToolsModule |
| `modules/skills/definitions/general/*.md` | General skills: file-operations, search, git-operations, planning |
| `modules/skills/definitions/specialized/*.md` | Specialized skills: react-patterns, api-design, testing-strategies, database-operations |

## Tools Module

| File | Responsibility |
|------|----------------|
| `modules/tools/services/filesystem-tools.service.ts` | read_file, write_file, edit_file, glob, grep, ls tools |
| `modules/tools/services/shell-tools.service.ts` | shell tool for executing commands |
| `modules/tools/services/search-tools.service.ts` | web_search, web_fetch tools |
| `modules/tools/services/tools-registry.service.ts` | Central registry for all tools |
| `modules/tools/tools.module.ts` | Exports ToolsRegistryService |

## MCP Module

| File | Responsibility |
|------|----------------|
| `modules/mcp/services/mcp-client.service.ts` | MCP protocol client (stdio, sse, http transports) |
| `modules/mcp/services/mcp-registry.service.ts` | Manages MCP connections, converts MCP tools to LangChain |
| `modules/mcp/mcp.module.ts` | Exports McpRegistryService |

## Project Module

| File | Responsibility |
|------|----------------|
| `modules/project/services/project-loader.service.ts` | Detects `.cast/` folder, loads context and MCP configs |
| `modules/project/services/project-context.service.ts` | Stores active project context, generates context prompt |
| `modules/project/project.module.ts` | Exports ProjectLoaderService and ProjectContextService |

## REPL Module

| File | Responsibility |
|------|----------------|
| `modules/repl/services/repl.service.ts` | Interactive CLI, handles commands (/help, /clear, /exit), streams AI responses |
| `modules/repl/repl.module.ts` | Imports CoreModule, exports ReplService |

---

# Data Flow

```
User Input
    ↓
ReplService.handleMessage()
    ↓
DeepAgentService.chat()
    ↓
createDeepAgent() from deepagents library
    ↓
┌─────────────────────────────────┐
│  Tools (9 built-in)             │
│  + MCP Tools (from Figma, etc)  │
│  + Subagents (7 specialized)    │
└─────────────────────────────────┘
    ↓
Streaming Response → Terminal
```

---

# Agents

| Agent | Description | Skills |
|-------|-------------|--------|
| `coder` | General purpose coding | file-operations, search, git-operations |
| `architect` | System design | file-operations, search, api-design |
| `reviewer` | Code review | file-operations, search |
| `frontend` | UI/UX implementation | file-operations, search, react-patterns |
| `backend` | API development | file-operations, search, api-design, database-operations |
| `tester` | Test automation | file-operations, search, testing-strategies |
| `devops` | Infrastructure/CI-CD | file-operations, search, git-operations |

---

# Skills

## General Skills

| Skill | Tools | Purpose |
|-------|-------|---------|
| `file-operations` | read_file, write_file, edit_file, glob, ls | File manipulation |
| `search` | grep, glob | Code search |
| `git-operations` | shell | Version control |
| `planning` | read_file, glob | Task decomposition |

## Specialized Skills

| Skill | Tools | Purpose |
|-------|-------|---------|
| `react-patterns` | read_file, write_file, edit_file | React development |
| `api-design` | read_file, write_file, edit_file | API design patterns |
| `testing-strategies` | read_file, write_file, edit_file, shell | Test automation |
| `database-operations` | read_file, write_file, edit_file, shell | Database design |

---

# Publishing to NPM

```bash
npm login
npm publish
```

Users install with:

```bash
npm install -g cast-code
cast
```

---

# Author

Pedro Castanheira

# Reference

This project is a attempt to develop a twin of Claude Code.