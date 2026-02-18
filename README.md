# Cast Code

A multi-agent coding CLI for day-to-day engineering work. Cast feels like an AI teammate living inside your terminal — it reads your codebase, plans work, uses tools, and delegates to specialist sub-agents.

Inspired by [Claude Code](https://claude.ai/code), [OpenAI Codex](https://openai.com/codex), and [Kimi](https://kimi.ai).
Built by [pedrocastanha](https://github.com/pedrocastanha).

---

## Why

The main goal is to accelerate product delivery, especially frontend work from design prototypes.

Typical workflow:
- connect Figma Desktop MCP
- map project context with `/init`
- ask Cast to scaffold screens, components, and styles
- let engineers focus on integration and business logic

---

## Install

```bash
npm install -g cast-code
cast
```

> Requires Node.js >= 20. Works on bash, zsh, fish, dash, ksh and any POSIX-compatible shell on Linux and macOS.

### `cast` not found after install?

The npm global bin directory may not be in your PATH. Find it with `npm prefix -g`, then add `<prefix>/bin` to your shell config:

| Shell | File | Line |
|---|---|---|
| bash | `~/.bashrc` or `~/.bash_profile` | `export PATH="$(npm prefix -g)/bin:$PATH"` |
| zsh | `~/.zshrc` | `export PATH="$(npm prefix -g)/bin:$PATH"` |
| fish | `~/.config/fish/config.fish` | `fish_add_path (npm prefix -g)/bin` |
| dash / ksh | `~/.profile` | `export PATH="$(npm prefix -g)/bin:$PATH"` |

Reload your shell (`source ~/.zshrc`, `source ~/.bashrc`, or open a new terminal), then run `cast`.

---

## First Run

On first launch the setup wizard runs automatically. To reconfigure at any time:

```bash
/config init
```

Config is stored at `~/.cast/config.yaml`.

---

## Providers

Cast supports multiple LLM providers. Configure via `/config init` or set environment variables:

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic / Claude |
| `OPENAI_API_KEY` | OpenAI / GPT |
| `GOOGLE_API_KEY` | Google Gemini |

You can also assign different models per purpose — `default`, `subAgent`, `coder`, `architect`, `reviewer`, `planner`, `cheap` — to tune cost and performance by task type.

---

## Commands

### Core

| Command | Description |
|---|---|
| `/help` | Show command guide |
| `/init` | Analyze project and generate context |
| `/project-deep` | Deep context + specialist brief |
| `/context` | Show session, tools, agents, skills, MCP status |
| `/clear` | Clear conversation history |
| `/compact` | Compact context window |
| `/exit` | Exit CLI |

### Config

| Command | Description |
|---|---|
| `/config` | Config menu |
| `/config show` | Show current config |
| `/config path` | Print config file path |
| `/config add-provider` | Add a new LLM provider |
| `/config set-model` | Set model by purpose |

### MCP

| Command | Description |
|---|---|
| `/mcp` | MCP hub menu |
| `/mcp list` | List configured servers |
| `/mcp tools` | List available tools |
| `/mcp add` | Add server (from templates or custom) |
| `/mcp remove` | Remove a server |
| `/mcp what` | Explain what MCP is |

### Git

| Command | Description |
|---|---|
| `/status`, `/diff`, `/log` | Git status, diff, log |
| `/commit` | AI-generated commit message |
| `/up`, `/split-up` | Push / push with split commits |
| `/pr` | Generate pull request description |
| `/review` | Code review |
| `/fix`, `/ident`, `/release` | Fix issues, identify patterns, generate release notes |

### Agents & Skills

| Command | Description |
|---|---|
| `/agents` | List specialist agents |
| `/agents create` | Create a custom agent |
| `/skills` | List skills |
| `/skills create` | Create a custom skill |

---

## Mentions

Inject context directly into any prompt:

```
@src/components/Button.tsx     — single file
@src/components/              — entire directory
@git:status                   — current git status
@git:diff                     — current diff
```

---

## Plan Mode

For complex requests Cast enters plan mode:
- asks clarifying questions
- generates a structured plan
- lets you refine, approve, or cancel
- executes with the approved plan as context

---

## MCP — Model Context Protocol

Cast ships with templates for 30+ MCP servers across categories: Dev Tools, Design, Data, Search, Cloud, Productivity, Payments, and Browser.

### Figma Desktop (recommended)

1. Install [Figma Desktop](https://www.figma.com/downloads/)
2. Open a Design file and enter Dev Mode (`<>` button, top right)
3. In the Inspect panel, enable **"Enable desktop MCP server"**
4. In Cast: `/mcp add` → Design → Figma Desktop
5. Restart Cast, then `/mcp` → Conectar servidores

For HTTP servers that require OAuth, Cast handles the full OAuth 2.0 + PKCE flow automatically and stores tokens in `~/.cast/mcp-auth/`.

---

## Technical Stack

- **Runtime**: Node.js >= 20, TypeScript
- **Framework**: NestJS (dependency injection, modular architecture)
- **LLM**: LangChain + LangGraph (multi-agent orchestration, streaming)
- **MCP**: `@modelcontextprotocol/sdk` (stdio and HTTP/SSE transports, OAuth 2.0 + PKCE)
- **Providers**: Anthropic, OpenAI, Google Gemini, Ollama
- **Config**: YAML stored at `~/.cast/config.yaml`
- **Auth tokens**: stored at `~/.cast/mcp-auth/<server>/`

### Project layout

```
src/modules/
  repl/        interactive CLI, commands, SmartInput
  core/        deep agent orchestration, system prompt, plan mode
  agents/      specialist sub-agents (coder, architect, reviewer…)
  skills/      skill definitions and knowledge loading
  mcp/         MCP client, OAuth provider, server registry, templates
  project/     project analysis and context generation
  tasks/       task management and plan execution tools
  git/         commit, PR, review, and release generators
  config/      provider and model configuration
  memory/      session memory tools
  mentions/    @-mention context injection
```

---

## Local Development

```bash
npm install
npm run build
npm run start
```

Watch mode:

```bash
npm run start:dev
```

---

## Notes

- Keep `.cast/context.md` updated — the richer the context, the better the answers.
- Project-level agents and skills live in `.cast/agents/` and `.cast/skills/` at the repo root.
- Run `/context` to verify what Cast can currently see.
