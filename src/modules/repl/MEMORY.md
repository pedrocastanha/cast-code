# REPL Module Memory

Updated: 2026-05-20

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/repl`.

## Purpose

The REPL module owns the interactive terminal experience: startup loop, smart input, slash command dispatch, command-specific UI, autocomplete, mentions/references, streaming display, footers, and shutdown.

## Key Files

- `repl.module.ts`: imports runtime modules and provides `ReplService`, `WelcomeScreenService`, command services, and `ConfigCommandsService`.
- `services/repl.service.ts`: top-level interactive loop, command routing, `/bridge` routing, prompt execution, queueing, references, mentions, streaming, footer, and shutdown.
- `services/smart-input.ts`: raw terminal input, suggestions, choice menus, question prompts, passive mode, and rendering.
- `services/command-ui.service.ts`: terminal panels/status helpers.
- `services/welcome-screen.service.ts`: startup banner and status line.
- `services/commands/*.service.ts`: command implementations for core, git, agents/skills, MCP, project, snapshot, stats, replay, sessions, vault, and platform.
- `utils/prompts-with-esc.ts` and `utils/theme.ts`: prompt cancellation and terminal styling helpers.

## Boundaries

- Business logic should stay in modules such as git, platform, benchmark, scheduler, sandbox, tasks, and core. REPL command services orchestrate and display.
- Platform setup UI lives here, but config parsing/writing lives in `platform`.
- SmartInput should not know domain command internals beyond suggestions and choices.

## Decisions To Preserve

- `/platform` is the advertised platform setup command; `/link` is legacy and should only warn/delegate.
- `/bridge` is the advertised provider bridge control command. It supports `claude`, `codex`, `copilot`, `qwen`, `kimi`, `openrouter`, plus `status`, `stop`/`disconnect`/`off`, `reset`, `raw on|off`, `tools`, and `help`; keep help, startup quick commands, autocomplete, and `BridgeCommandsService` in sync.
- While a bridge is connected, normal non-slash REPL prompts route to `BridgeCommandsService.runPrompt`; slash commands keep local Cast routing. `/bridge stop` returns prompts to `DeepAgentService`.
- Bridge responses must print through SmartInput external output blocks and stream chunks when available; avoid raw `process.stdout.write` for large bridge answers because it corrupts the footer/prompt layout.
- `/config` should not contain platform setup.
- After successful platform linking, refresh `DeepAgentService` so remote definitions/RAG become active immediately.
- Keep command help/suggestions in sync with actual command handlers.
- Avoid printing secrets in status, context, or footer output.
- Streaming output and spinner rendering must not corrupt the prompt line.

## Tests

Specs cover REPL service, command UI, SmartInput, and several command services under `src/modules/repl`.

Update this file when slash commands, command help, SmartInput behavior, platform command UX, streaming display, or session resume/context behavior changes.
