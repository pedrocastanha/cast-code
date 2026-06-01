# Bridge Module Memory

Updated: 2026-05-21

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/bridge`.

## Purpose

The bridge module lets Cast drive an external, user-authenticated model CLI while Cast keeps ownership of tools, permissions, transcripts, and local project execution. Direct entry is `cast bridge <provider>`.

Core product rule: the provider model thinks, Cast executes tools.

## Key Files

- `bridge.module.ts`: wires bridge services and exports command/runtime/session services.
- `commands/bridge-commands.service.ts`: starts provider bridge sessions, handles direct prompts, exposes connection state for REPL routing, implements the bare `/bridge` provider picker, persists project autostart in `.cast/bridge.json`, and implements `/bridge <provider>|status|stop|disconnect|off|reset|autostart|raw|tools|help`.
- `providers/claude-bridge-adapter.ts`: generic CLI provider adapter plus Claude wrapper, env overrides, startup failure classification, stream/raw/Codex JSON input-output formatting, and protocol prompt formatting.
- `services/bridge-session.service.ts`: provider process lifecycle. It tries optional `node-pty` and falls back to `child_process` pipes when the native module is unavailable; stream-json and JSONL adapters force pipe transport because `claude -p --input-format stream-json` and `codex exec --json` are pipe-oriented.
- `services/bridge-protocol.service.ts`: Cast XML-ish protocol prompt/result builders and parser for `<cast_tool_call>`, `<cast_tool_result>`, and `<cast_turn_done/>`.
- `services/bridge-tool-executor.service.ts`: allowlisted bridge tools mapped to `ToolsRegistryService`; normalizes aliases such as `path -> file_path`.
- `services/bridge-runtime.service.ts`: user-turn loop that parses provider output, executes Cast tools, returns tool results, and writes transcripts.
- `services/bridge-transcript.service.ts`: redacted local JSONL transcripts under `.cast/bridge/transcripts`.
- `scripts/fixtures/bridge/fake-claude-cli.mjs`: deterministic fake provider for local smoke testing.

## Commands

- Direct: `cast bridge <claude|codex|copilot|qwen|kimi|openrouter>`
- Scripted/direct smoke: `CAST_BRIDGE_SCRIPTED_INPUT='["message","/bridge status","/exit"]' node dist/main.js bridge claude`
- Assertive fake-provider smoke: `npm run smoke:bridge`
- REPL: `/bridge` picker, `/bridge claude`, `/bridge codex`, `/bridge copilot`, `/bridge qwen`, `/bridge kimi`, `/bridge openrouter`, `/bridge status`, `/bridge stop`, `/bridge reset`, `/bridge autostart <provider>|off`, `/bridge raw on|off`, `/bridge tools`, `/bridge help`

Bridge mode intentionally skips normal model API-key setup. It uses the user's authenticated provider CLI account when the real provider is used. In the REPL, bridge sessions are sticky for normal non-slash prompts until `/bridge stop` or `Stop bridge` in the bare `/bridge` picker; slash commands remain Cast-local. `BridgeCommandsService` owns the active bridge routing flag, while `BridgeSessionService` owns only the provider child process. Do not use provider process status alone for REPL routing: one-shot providers such as Claude stream-json and Codex JSONL may be disconnected between turns and must be reopened by `runPrompt`. Project autostart can be persisted in `.cast/bridge.json` through `/bridge autostart <provider>` or Tab in the bare `/bridge` picker. Claude CLI and Codex CLI are validated against live accounts.

## Environment Overrides

- `CAST_BRIDGE_<PROVIDER>_COMMAND`: provider command override, for example `CAST_BRIDGE_QWEN_COMMAND=qwen-code`.
- `CAST_BRIDGE_<PROVIDER>_ARGS`: provider args, whitespace-split.
- `CAST_BRIDGE_CODEX_JSON=0|1`: force raw or `codex exec --json` adapter mode. By default, real Codex uses `codex exec --ignore-user-config --ignore-rules --json --color never --sandbox read-only --skip-git-repo-check -`.
- `CAST_BRIDGE_CLAUDE_MODEL`: model alias/name for the real Claude CLI stream-json provider, default `sonnet`.
- `CAST_BRIDGE_CLAUDE_MAX_BUDGET_USD`: optional Claude CLI `--max-budget-usd` value for direct validation runs.
- `CAST_BRIDGE_CLAUDE_STREAM_JSON=0|1`: force raw or stream-json adapter mode. By default, the real `claude` command uses stream-json, while command/args overrides use raw protocol for fakes.
- `CAST_BRIDGE_<PROVIDER>_ONE_SHOT=0|1`: override whether the runtime should reopen a follow-up provider turn after a tool result. Claude stream-json defaults to one-shot follow-up.
- `CAST_BRIDGE_DISABLE_PTY=1`: force child-process pipe fallback for CI/smoke environments where PTY behavior is unstable.
- `CAST_BRIDGE_TURN_IDLE_MS`: runtime idle timeout per turn.
- `CAST_BRIDGE_TURN_FIRST_BYTE_MS`: first provider-output timeout before the idle timer is enforced; defaults longer than idle because real CLIs can have cold starts.
- `CAST_BRIDGE_MAX_TOOL_ROUNDS`: max bridge tool-call rounds.
- `CAST_BRIDGE_SCRIPTED_INPUT`: JSON string array of direct-mode lines for smoke/noninteractive tests.

## Decisions To Preserve

- Keep `/remote` separate. Bridge is provider runtime substitution; remote is browser/mobile access to a Cast session.
- Keep `Stop bridge` in the bare `/bridge` picker as the interactive path back to the normal API-key runtime.
- Do not expose raw provider output by default. Store redacted transcript events.
- Bridge tools are allowlisted through `BridgeToolExecutorService`; do not pass arbitrary tool names directly to the registry.
- `node-pty` is optional because native compilation can fail on some systems. Runtime must continue to build and test with the pipe fallback.
- Stream-json provider sessions should use pipe transport even when `node-pty` is installed; PTY can keep real Claude CLI runs from returning visible stream-json output.
- Codex default mode is one-shot JSONL, not the interactive TUI. Close stdin after writing a Codex prompt, parse only `agent_message` JSONL events as model output, and ignore Codex command-execution/status events so Cast remains the visible tool owner.
- The provider may propose tool calls, but Cast owns execution, permissions, file guards, shell guards, and command routing.
- Never trust provider-emitted `<cast_tool_result>` blocks. Only Cast writes valid tool results. If a one-shot provider answers from an invented result, discard that answer and follow up with the real Cast result.
- Follow-up turns are response-only: do not send the full tool manifest again. If the provider returns no usable final text, fall back to the real Cast tool result. For package script requests, extract scripts from the actual `package.json` JSON returned by Cast.
- Do not apply the short idle timeout before the provider emits its first non-empty chunk. Real CLIs such as Claude can take longer to produce the first visible text than local fake providers, and stream-json metadata can sanitize to empty output.
- Streaming bridge responses should go through callbacks into the REPL SmartInput external output block. This keeps large responses from corrupting the prompt/footer and makes the bridge feel like the normal Cast stream instead of a single delayed HTTP response.
- Tool-call visibility is part of the bridge UX. `BridgeRuntimeService` callbacks should surface tool start/result events to the REPL, and the REPL should render compact one-line summaries rather than raw tool payloads.
- `BridgeRuntimeService` also emits typed `CastRuntimeEvent` objects through
  `BridgeRuntimeCallbacks.onRuntimeEvent`. Keep the older `onOutputChunk`,
  `onToolCall`, and `onToolResult` callbacks working while the typed runtime
  stream is rolled out. Bridge runtime events are local detail; platform
  telemetry must go through `RuntimeTelemetryProjectorService` before tracking.
- Claude stream-json output can put useful text in a `result` event when no assistant text was emitted; reset adapter output state on every provider start and use `result` only as a no-assistant fallback to avoid duplicate output.
- Keep `/help`, startup quick commands, autocomplete, `list_commands`, README, and this memory in sync when `/bridge` surface changes.

## Tests

Unit specs cover protocol parsing, tool execution, adapter behavior, session lifecycle, transcripts, runtime loop, and commands. Direct smoke should be validated with the fake Claude provider using `CAST_BRIDGE_SCRIPTED_INPUT`, a fake non-Claude provider command override, plus live Claude CLI when available.

Update this file when bridge protocol tags, provider startup, tool allowlist/schema aliases, transcript format, direct command behavior, or `/bridge` commands change.
