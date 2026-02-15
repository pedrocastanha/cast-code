# Cast Code

Cast Code is a multi-agent coding CLI for day-to-day engineering work.
It is designed to feel like an in-terminal AI teammate that can read your codebase, plan work, use tools, and delegate to specialist sub-agents.

## Why this project

Main goal: accelerate product delivery, especially frontend bootstrap work from design prototypes.

Typical target workflow:
- connect Figma MCP,
- map project context,
- ask Cast to scaffold screens/components/styles,
- let frontend engineers focus on integration and complex business flows.

## Requirements

- Node.js `>= 20`
- npm
- At least one LLM provider configured (`/config init`)

## Install

```bash
npm install
npm run build
npm run start
```

For development mode:

```bash
npm run start:dev
```

## First Run

On first run, configure providers/models:

```bash
/config init
```

Configuration file:
- `~/.cast/config.yaml`

## Frontend Daily Flow (Recommended)

1. Connect Figma MCP

```bash
/mcp add
```

2. Map project context

```bash
/init
```

`/init` is the project bootstrap command. It analyzes the repo and refreshes `.cast/context.md`.

3. Validate specialists

```bash
/agents
/skills
/context
```

4. Prompt for scaffold generation

Example prompt:

```text
Use Figma to extract main screens and create a full frontend scaffold:
- routes
- page skeletons
- reusable UI components (button, table, modal, form)
- design tokens and global styling
- responsive behavior
```

## Useful Commands

### Core
- `/help` show command guide
- `/init` analyze project and generate context
- `/project-deep` generate deep context + specialist brief
- `/context` show session, tools, agents, skills, MCP status
- `/clear` clear conversation history
- `/compact` compact context window
- `/exit` exit CLI

### Config
- `/config` config menu
- `/config show` show current config
- `/config path` print config path
- `/config add-provider` add provider
- `/config set-model` set model by purpose

### MCP
- `/mcp` MCP hub menu
- `/mcp list` list servers
- `/mcp tools` list tools
- `/mcp add` add server from templates or custom
- `/mcp remove` remove server
- `/mcp what` explain MCP

### Git
- `/status`, `/diff`, `/log`
- `/commit`, `/up`, `/split-up`, `/pr`
- `/review`, `/fix`, `/ident`, `/release`

### Agents & Skills
- `/agents`, `/agents create`
- `/skills`, `/skills create`

## Mentions

Use mentions to inject context directly:

- `@src/file.ts`
- `@path/to/dir/`
- `@git:status`
- `@git:diff`

## Plan Mode

For complex requests, Cast can enter plan mode:
- asks clarifying questions,
- generates a structured plan,
- allows refine/approve/cancel,
- executes with the approved plan as context.

## Providers and Model Purposes

Cast supports multiple providers and model purposes:
- `default`
- `subAgent`
- `coder`
- `architect`
- `reviewer`
- `planner`
- `cheap`

This enables cost/performance tuning by task type.

## Project Structure (high level)

- `src/modules/repl` interactive CLI and commands
- `src/modules/core` deep agent orchestration and system prompt
- `src/modules/agents` specialist sub-agents
- `src/modules/skills` skill definitions and knowledge
- `src/modules/mcp` MCP integration
- `src/modules/project` project analysis/context generation
- `src/modules/tasks` task and plan tools

## Notes

- Keep `.cast/context.md` updated for better answers.
- For MCP servers requiring OAuth (like Figma), authenticate after adding and restarting Cast.
- If no agents/skills appear, run `/context` and verify project-level `.cast/agents` and `.cast/skills`.
