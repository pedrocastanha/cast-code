# Core Module Memory

Updated: 2026-05-20

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/core`.

## Purpose

The core module owns the main AI runtime: DeepAgents/LangGraph initialization, prompt construction, tool and subagent selection, plan-mode helpers, compact chat, streaming, stats, replay, local state, memory, platform context, and benchmark prompt execution.

## Key Files

- `core.module.ts`: imports almost every runtime module and exports `DeepAgentService`, plan/prompt services, and key runtime modules.
- `services/deep-agent.service.ts`: the central runtime service. It initializes project context, model clients, filesystem backend, tool sets, subagents, environment context, platform context, memory, stats, traces, and execution.
- `services/plan-mode.service.ts`: decides when to enter planning, generates/refines plans, and formats plan displays.
- `services/prompt-loader.service.ts`: seeds and caches user prompt templates.
- `services/prompt-classifier.service.ts`: classifies prompts into contextual layers such as git, PR, release, MCP, mentions, and planning.

## Boundaries

- REPL input and slash command routing live in `repl`.
- Tool implementation lives in `tools`, `memory`, `mcp`, and related modules.
- Agent/skill definitions live in `agents` and `skills`; core resolves and wires them.
- Platform HTTP and config details live in `platform`.

## Decisions To Preserve

- Short greetings and simple capability questions should use compact chat without tools.
- Real project work should go through the deep tool-using path.
- The workspace-aware filesystem backend must allow sibling workspace directories, such as `../web` and `../backend`, when inside the detected workspace root.
- Prompts must include both working directory and workspace root.
- Tool/subagent selection should stay lazy and contextual; avoid injecting every tool, agent, skill, or MCP on every turn.
- Keep sensitive content redaction for local state, trace, replay, and platform session events.
- After `/platform` or environment changes, reinitialize/refresh runtime context so remote skills, agents, RAG, and environment scope are active.
- The base prompt should teach the agent to use `list_commands(command: "bridge")` when users ask about `/bridge`; bridge means provider CLI runtime substitution, not remote web access, and `/bridge stop` returns normal prompts to the Cast runtime.

## Tests

Primary specs live under `src/modules/core/services/*.spec.ts`.

Update this file when DeepAgent runtime wiring, prompt layers, compact/lean routing, workspace path behavior, session summary, local state, or platform/environment integration changes.
