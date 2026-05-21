# Cast Code Memory

Updated: 2026-05-21

This file is intended to be read by future assistant sessions before changing the Cast CLI. It summarizes what the system does, how the main modules fit together, and what decisions are important to preserve.

## Memory Maintenance Rule

After completing any task in this repository, update memory before the final response when the task changed behavior, architecture, public commands, setup flow, data contracts, security/privacy policy, test expectations, or module ownership.

- Update the relevant `src/modules/<module>/MEMORY.md` file for module-local changes.
- Update this root `MEMORY.md` for project-wide decisions, cross-module flows, validated states, or rules future agents must preserve.
- If the change affects the broader Cast workspace (`cast-code`, `backend`, `web`, or `memory` together), also update the appropriate workspace-level memory document referenced by `/home/pedro-castanheira/.codex/memories/cast-system-memory.md`.
- Do not update memory for purely mechanical formatting unless it changes a convention future agents need to know.

## Workspace Map

The local workspace is a multi-package Cast product:

- `cast-code/`: the npm-distributed CLI assistant. This is the package users install with `npm i -g cast-code`.
- `backend/`: the Cast Platform API. It owns auth, projects, remote skills, agents, sessions, RAG, memory, benchmarks, environments, MCP catalog, and schedules.
- `web/`: the Cast Platform web app. It is a Next.js UI for managing projects, skills, agents, RAG/memory, benchmark runs, schedules, environments, MCPs, API keys, and plan/account pages.
- `memory/`: reusable memory/RAG core package. It contains the domain engine, memory service facade, vector index ports/adapters, and a static standalone console. The backend currently exposes the HTTP API, while this package is the extraction path toward reusable memory infrastructure.

The CLI is not supposed to be a separate isolated toy. It is the local agent runtime. The platform is the private control plane. The intended product experience is:

1. User installs `cast-code` globally.
2. User runs the CLI in any project directory.
3. User links the directory to Cast Platform with `/platform` or `cast platform --project <id>`.
4. Platform provides remote skills, remote agents, RAG/memory context, benchmark/schedule sync, MCP catalog metadata, and project-specific settings.
5. The CLI still keeps conversation privacy. It does not sync raw conversation content by default. Session telemetry is sanitized.

## High-Level Product Intent

Cast Code is a multi-agent coding CLI with platform-managed knowledge and governance. It combines local codebase access, slash commands, sub-agent orchestration, skills, MCPs, RAG, benchmarks, and schedulers.

The long-term direction is inspired partly by Nous Hermes Agent, but Cast should be stronger in several product areas:

- Domain environments instead of one flat skill bag. Examples: engineering, marketing, design.
- Platform-managed skills per project, not only local static skills.
- RAG/document memory per project, private by default.
- Benchmark Lab integrated into CLI and web platform.
- Schedules for recurring benchmark or project intelligence tasks.
- Governed MCP catalog with risk and mutation policies.
- Strong local safety boundaries: no raw secret leaks, no project prompts persisted to platform events, and writes gated by permissions/sandbox decisions.

Active bridge implementation:

- `cast bridge <provider>` starts a provider bridge where Cast uses a user-authenticated provider CLI as the local model runtime. Supported provider IDs are `claude`, `codex`, `copilot`, `qwen`, `kimi`, and `openrouter`.
- In the REPL, bare `/bridge` opens a SmartInput provider picker. Enter connects the selected provider; Tab connects it and enables project autostart; `Stop bridge` restores the normal API-key runtime. `/bridge <provider>` connects directly and then routes normal non-slash prompts through that bridge until `/bridge stop`, `/bridge disconnect`, `/bridge off`, or `Stop bridge` is used. Slash commands remain local Cast commands.
- Product rule: the provider model thinks, Cast executes tools. Cast keeps ownership of tool allowlists, permissions, transcripts, and file/shell guards.
- Claude CLI is the first real validated provider and uses `stream-json` by default. Other provider IDs are raw CLI adapters that can be pointed at concrete commands with `CAST_BRIDGE_<PROVIDER>_COMMAND` and `CAST_BRIDGE_<PROVIDER>_ARGS`.
- Codex CLI defaults to `codex exec --json --ignore-user-config --ignore-rules ... -` rather than the interactive TUI. It is a one-shot provider: Cast writes the prompt, closes stdin, parses JSONL `agent_message` events, and restarts Codex for follow-up turns.
- The bridge is separate from `/remote`. Bridge substitutes the local model runtime; remote exposes a Cast session to a browser/mobile client.
- If a provider invents `<cast_tool_result>` data or refuses to answer after Cast returns real tool output, the bridge runtime must prefer the real Cast tool result. For `package.json` script requests, the fallback extracts scripts from the actual JSON returned by Cast instead of trusting provider memory.
- Bridge runtime has separate first-non-empty-byte and idle timeouts. Keep the first-byte timeout longer than idle because real provider CLIs can have slow cold starts and stream-json metadata before visible output.
- Stream-json bridge adapters force pipe transport even when `node-pty` exists; real `claude -p --input-format stream-json` should not run behind a PTY.
- JSON bridge adapters such as Codex also force pipe transport. Do not run one-shot JSON providers behind PTY.
- Bridge tool activity is visible in the REPL stream. `BridgeRuntimeService` emits tool callbacks and `ReplService` prints compact start/result lines inside the provider output block, for example `read file package.json` and `read_file ok - 2 lines, 240 B`; keep summaries compact instead of dumping raw tool output into the terminal.
- Bridge runtime now also emits typed `CastRuntimeEvent` objects. The REPL
  projects those events through `RuntimeTelemetryProjectorService` before
  calling `PlatformService.track`, so platform telemetry receives sanitized
  metadata instead of raw assistant/tool content.
- `docs/superpowers/specs/2026-05-19-cast-bridge-claude-design.md` is the design record for the bridge.
- `docs/superpowers/plans/2026-05-19-cast-bridge-claude.md` is the approved implementation plan that led to the current module.

## Main CLI Runtime

Entry point: `src/main.ts`

Important startup behavior:

- Loads `.env` for local development only. Global npm users do not need a project `.env`.
- Supports direct `cast platform ...` command before entering REPL.
- Supports direct `cast bridge <claude|codex|copilot|qwen|kimi|openrouter>` command before entering REPL. Bridge mode intentionally skips normal model API-key setup because the provider CLI owns authentication.
- Keeps legacy `cast link` as a warning/delegation path, but `/link` should not be advertised anymore.
- Runs initial config setup if `~/.cast/config.yaml` does not exist.
- Starts `ReplService` for the interactive loop.
- Shuts down `ReplService`, `PlatformService`, and the Nest app on SIGINT/SIGTERM.

The CLI is built with NestJS modules, but it is a terminal application, not an HTTP server.

Core commands:

- `npm run start:dev`: dev runner, watches `src/main.ts`.
- `npm run build`: fast build into `dist/`.
- `npm run start`: runs `node dist/main.js`.
- `npm test`: Node test runner over `src/**/*.spec.ts`.
- `npm run typecheck`: TypeScript build config check.

## Module Memory Index

Each top-level module under `src/modules` has a local memory file. Read the relevant module memory before editing that module.

- `src/modules/agents/MEMORY.md`: sub-agent definitions, validation, registry resolution, and delegated run tracking.
- `src/modules/benchmark/MEMORY.md`: Benchmark Lab discovery, definitions, graders, sandbox execution, artifacts, and platform sync.
- `src/modules/bridge/MEMORY.md`: provider CLI bridge runtime, provider adapters, bridge protocol, tool allowlist, transcripts, and `/bridge`.
- `src/modules/config/MEMORY.md`: global CLI config, providers, model routing, effort, and `/config`.
- `src/modules/core/MEMORY.md`: DeepAgent runtime, prompts, tool/subagent selection, compact chat, stats, replay, local state, platform context, and task execution.
- `src/modules/diff/MEMORY.md`: pure diff generation and terminal display formatting.
- `src/modules/environments/MEMORY.md`: domain environments, activation, readiness, default benchmarks, and `/env`.
- `src/modules/git/MEMORY.md`: commit/PR/review/fix/release/unit-test git workflows.
- `src/modules/i18n/MEMORY.md`: language selection, locales, and agent language instructions.
- `src/modules/kanban/MEMORY.md`: local Kanban task board server and SSE UI.
- `src/modules/mcp/MEMORY.md`: MCP clients, registry, OAuth, catalog, risk scanning, and mutation policy.
- `src/modules/memory/MEMORY.md`: CLI-local memory tools and platform RAG tool facade.
- `src/modules/mentions/MEMORY.md`: `@` mention parsing and context expansion.
- `src/modules/permissions/MEMORY.md`: command approval, rules, prompts, and danger classification.
- `src/modules/platform/MEMORY.md`: Cast Platform linking, config, cache, project payload, RAG, benchmark/schedule APIs, and sanitized sessions.
- `src/modules/project/MEMORY.md`: project/workspace detection, context storage, and project analysis.
- `src/modules/remote/MEMORY.md`: remote web UI, stdout streaming, inbound browser/mobile prompts, and ngrok exposure.
- `src/modules/repl/MEMORY.md`: terminal loop, SmartInput, slash commands, streaming display, and command UX.
- `src/modules/replay/MEMORY.md`: local replay timelines and trace export integration.
- `src/modules/runtime/MEMORY.md`: typed runtime event contract and sanitized
  platform telemetry projection.
- `src/modules/sandbox/MEMORY.md`: Docker/worktree/snapshot/noop sandbox backends, rollback, and artifacts.
- `src/modules/scheduler/MEMORY.md`: recurring schedules, cron, policy, execution, worker, suggestions, and platform sync.
- `src/modules/skills/MEMORY.md`: built-in/project/user/session/remote skill loading, registry, metadata, runtime tools, search, and scoping.
- `src/modules/skills-import/MEMORY.md`: Hermes skill discovery, conversion, duplicate detection, classification, and risk scanning.
- `src/modules/snapshots/MEMORY.md`: file/project checkpoints and rollback support.
- `src/modules/state/MEMORY.md`: local SQLite state, migrations, sessions, FTS, and redaction.
- `src/modules/swarm/MEMORY.md`: Agent Swarm plans, runs, worktree workers, bridge-aware runtime, and `/swarm`.
- `src/modules/stats/MEMORY.md`: token/cost tracking, local stats persistence, and usage listeners.
- `src/modules/tasks/MEMORY.md`: in-session task/plan management, approval, persistence, execution, and task tools.
- `src/modules/tools/MEMORY.md`: filesystem, shell, discovery, search, and impact-analysis tools.
- `src/modules/trace/MEMORY.md`: structured local traces, redaction, reading, writing, and export.
- `src/modules/vault/MEMORY.md`: local snippets and snippet-to-skill promotion.
- `src/modules/watcher/MEMORY.md`: debounced source file-change events.

## Module Responsibilities

### `src/modules/core`

Owns the main AI agent runtime.

Key service:

- `DeepAgentService`: creates the DeepAgents/LangGraph agent, selects compact chat vs deep tool-using path, builds system prompts, wires local tools, MCP discovery tools, sub-agents, platform context, memory tools, environment context, stats, replay, and session tracking.

Important behavior:

- Short greetings and simple capability questions use a compact chat path without tools. This avoids wasting context and prevents fake file inspection.
- Real project work goes through the deep agent.
- Main DeepAgents streaming is normalized through `DeepAgentEventAdapterService`.
  It tries DeepAgents v3 stream projections in `auto` mode and falls back to
  the v2 `streamEvents` event stream when projections are unavailable, while
  preserving existing terminal output from raw v2 events.
- The CLI is validated against `deepagents@1.9.0` and `@langchain/quickjs@0.4.0`
  for the LangChain Deep Agents v0.6-era TypeScript stack. Do not replace the
  dynamic QuickJS import with a static CommonJS `require`; the package's CJS
  path can fail on ESM-only transitive dependencies.
- Main DeepAgents agents include the QuickJS `eval` middleware with read-only
  programmatic tool calling for `ls`, `read_file`, `glob`, and `grep`. If local
  `.cast/skills` or `.skills` directories exist, Cast also passes them to native
  DeepAgents skills support.
- Main model runtime events are projected through `RuntimeTelemetryProjectorService`
  before reaching Platform sessions. Keep platform telemetry metadata-only;
  message text and raw tool output remain local.
- DeepAgents built-in filesystem backend is wrapped by `WorkspaceFilesystemBackend`. Relative paths resolve from the active project root, but sibling directories inside the detected workspace root are allowed. This is why a prompt like "look at ../web" should work from `cast-code`.
  That wrapper now implements `BackendProtocolV2` (`ls`, `read`, `grep`, `glob`
  structured results) because newer DeepAgents versions removed the old
  `lsInfo`/`grepRaw`/`globInfo` backend methods.
- The project root is usually the nearest folder with Cast project config. The workspace root is the outermost ancestor with `.cast` when present, otherwise the project root.
- Built-in DeepAgents tools are filtered/controlled, while Cast-specific tools come from `ToolsRegistryService`.
- Prompts include working directory and workspace root. This matters so the model does not accidentally treat `/` as the project.

Recent fix to remember:

- The agent previously tried paths like `/../web` or listed `/` when the user asked for `cd .., cd web`. The fix was to expose a workspace-aware filesystem backend and update shell/filesystem tools to allow sibling folders under the workspace root.

### `src/modules/repl`

Owns terminal UI, slash command routing, smart input, command panels, interactive menus, and the command reference.

Important services:

- `ReplService`: top-level interactive loop and command dispatcher.
- `CommandUiService`: panel/status rendering.
- Command services under `src/modules/repl/services/commands`.
- `SmartInput`: terminal input, suggestions, choice menus, questions.

Important command rules:

- `/platform` is the only advertised Platform setup command.
- `/bridge` controls the active provider bridge session from the REPL. Bare `/bridge` is an interactive provider picker with a `Stop bridge` option; connected bridge sessions consume normal prompts until `/bridge stop` or the picker stop option; project autostart is opt-in via `.cast/bridge.json`. Keep help, suggestions, discovery command metadata, README, and memory in sync with bridge command handlers.
- Active bridge prompts display tool-call progress through SmartInput external output blocks. Preserve the compact format and do not stream full file/shell payloads into the prompt area.
- `/link` is removed from help/suggestions. If invoked, it prints a warning and points to `/platform`.
- `/config` should not manage Cast Platform anymore. It remains for model/provider/prompt config.
- `/help` should show `/platform` under "AGENTS, PROJECT, CONFIG".
- After successful `/platform`, `DeepAgentService.initialize()` is called again so remote skills/agents/RAG become available immediately.

### `src/modules/bridge`

Owns provider CLI bridge sessions.

Key services:

- `BridgeCommandsService`: direct command and `/bridge` command surface for all supported provider IDs, including connection status and stop/disconnect helpers for REPL routing.
- `CliBridgeAdapter`/`ClaudeBridgeAdapter`: provider command, environment overrides, stream/raw input formatting, and protocol handshake.
- `BridgeSessionService`: PTY/pipe process lifecycle.
- `BridgeRuntimeService`: turn loop, provider output parsing, Cast tool execution, and result return.
- `BridgeToolExecutorService`: allowlisted Cast tools exposed to the provider.
- `BridgeTranscriptService`: redacted local transcript events.

Important behavior:

- `cast bridge <provider>` uses the user's authenticated provider CLI account instead of requiring a Cast/OpenAI API key.
- REPL `/bridge <provider>` is sticky for normal prompts; `/bridge stop` restores the normal Cast/OpenAI runtime without restarting the CLI.
- Active bridge provider processes are in-memory state. Closing the Cast CLI kills the provider process, but `/bridge autostart <provider>` or Tab in the `/bridge` picker persists a project autostart preference in `.cast/bridge.json`; the REPL reconnects that provider on startup until `/bridge autostart off`.
- Bridge routing state is separate from the provider child-process status. One-shot providers such as Claude stream-json and Codex JSONL may be disconnected between turns, but normal prompts must still route through bridge mode and reopen the provider until `/bridge stop` clears the active bridge.
- Provider models can request tool calls with the bridge protocol, but Cast executes them through existing tool, permission, and filesystem guards.
- One-shot providers such as real `claude -p` can emit a tool call and exit; the runtime must reopen a provider turn and answer from the real Cast tool result instead of trusting provider-invented `<cast_tool_result>` text.
- The Claude stream-json adapter should use assistant text first and only fall back to result text when no assistant text was emitted for that provider start.
- `node-pty` is optional; the bridge must keep working through the child-process pipe fallback when native installation fails or `CAST_BRIDGE_DISABLE_PTY=1` is set for CI/smoke runs.
- Do not merge bridge with `/remote`; they solve different problems.

### `src/modules/platform`

Owns all CLI-to-platform integration.

Key services:

- `PlatformConfigService`: reads project `.cast/cast.yaml`, reads global platform config from `~/.cast/config.yaml`, validates URLs and key env names, and resolves the API key source.
- `PlatformCommandsService`: implements `/platform`, `cast platform`, `/platform status`, direct flags, interactive setup, global key saving, and project manifest writing.
- `PlatformService`: bootstraps platform context, authenticates, fetches project payload, loads remote definitions into registries, handles offline/cache status.
- `PlatformClientService`: HTTP client for `/v1/auth/me`, `/v1/projects/:id`, sessions, RAG/memory, benchmarks, schedules.
- `PlatformCacheService`: caches remote project payload and pending events when offline.
- `RemoteDefinitionAdapterService`: converts platform payload into local runtime skill/agent/MCP definitions.
- `SessionTrackerService`: opens/closes platform sessions and sends sanitized metadata.

Config model:

- Project file: `.cast/cast.yaml`
- Global file: `~/.cast/config.yaml`

Project file should contain project binding only:

```yaml
version: 1
platform:
  projectId: <uuid>
  apiKeyEnv: CAST_API_KEY
  apiUrl: http://localhost:3001
```

Global file can contain the actual key:

```yaml
platform:
  apiKey: csk_...
  apiUrl: http://localhost:3001
```

API key resolution order:

1. `process.env[apiKeyEnv]`, usually `CAST_API_KEY`
2. `platform.apiKey` from `~/.cast/config.yaml`

Important security decision:

- Do not store real API key values inside `.cast/cast.yaml`. That file lives inside the project/repo and can be committed, copied, or shared. The actual key belongs in global user config or env.
- `/platform status` must only show whether the key is present and where it is expected from, never print the key.

Recent fix to remember:

- A real key was accidentally placed in `.cast/cast.yaml` as `apiKeyEnv`. Validation now treats values that look like API keys as invalid env names, and `/platform` writes `apiKeyEnv: CAST_API_KEY`.

### `src/modules/config`

Owns global CLI model/provider/settings config.

Important responsibilities:

- First-run setup.
- Provider API keys and base URLs.
- Model routing by purpose: default, sub-agents, coder, architect, reviewer, planner, tester, economical.
- Effort level.
- Prompt template editing.

Important boundary:

- Platform setup should not live under `/config` anymore. Keep `/platform` as the one flow for platform URL, global key, and project link.

### `src/modules/project`

Owns project detection/loading and project context.

Important services:

- `ProjectLoaderService`: detects Cast project root and now detects workspace root for sibling directory access.
- `ProjectContextService`: stores project context generated by `/init` and other analysis flows.

Project root vs workspace root:

- Project root is the active directory for default file operations.
- Workspace root is a broader boundary allowing sibling package reads/writes when the Cast workspace contains multiple packages such as `cast-code`, `backend`, and `web`.

### `src/modules/tools`

Owns tools exposed to the agent.

Important services:

- `ToolsRegistryService`: central registry.
- `FilesystemToolsService`: read/write/list/search files with path guards.
- `ShellToolsService`: run shell commands with root guards and optional cwd.
- `MemoryToolsService`: exposes `rag_search` and related memory tools to the agent.
- `DiscoveryToolsService`: exposes `cast_command` to let the agent request slash command execution through the host with permission.

Recent fixes:

- Filesystem and shell tools default to project root but accept sibling cwd/path inside workspace root.
- `rag_search` no longer throws on empty query. It returns platform memory overview or a clear unavailable message.

### `src/modules/agents`

Owns sub-agent definitions and registry.

Important behavior:

- Loads local built-in/project agents.
- Merges platform remote agents.
- Local project agents can override remote definitions.
- Agent registry injects adaptive test-first workflow instructions.
- The UI should avoid eagerly dumping all agent definitions into every prompt. Discovery stays lazy unless useful.

### `src/modules/skills`

Owns local/built-in/platform skill loading and lookup.

Important behavior:

- Built-in skills live under `src/modules/skills/definitions`.
- Remote platform skills are adapted and merged into runtime.
- Governed skills can be inactive and still retained for scanning/governance.
- Skills are not supposed to all be always injected. They should be discoverable and selected based on task/environment.

### `src/modules/skills-import`

Owns Hermes skill import tooling.

Important services:

- `HermesSkillDiscoveryService`: finds Hermes `SKILL.md` files.
- `SkillConverterService`: converts Hermes format to Cast governed skill markdown.
- `SkillDuplicateDetectorService`: detects duplicate and similar skills.
- `SkillEnvironmentClassifierService`: classifies skills into Cast environments.
- `SkillRiskScannerService`: flags prompt injection, secret exfiltration, destructive commands, and other risky patterns.

Product intent:

- Hermes has many skills in one flat collection. Cast should support importing/curating those ideas, but organize them into governed environments and keep risky skills inactive/quarantined.

### `src/modules/environments`

Owns domain environment packs.

Built-in environments currently include:

- `engineering`
- `marketing`
- `design`

Environment responsibilities:

- Define default agent.
- Define required/optional skills.
- Recommend/require MCPs.
- Set permission defaults.
- Recommend RAG sources.
- Seed smoke benchmarks.
- Suggest schedules.

Product intent:

- Environments make Cast feel ready for a domain. A marketing environment should give the agent campaign strategy/copy/performance skills. A design environment should bring UI/design system/Figma/visual QA context. Engineering should focus on code review, TDD, debugging, architecture, tests.

### `src/modules/mcp`

Owns MCP config, catalog templates, registry, security scanning, and connection state.

Important behavior:

- MCP tools are lazy and gated. The agent should not preload all MCP tools unless the prompt asks for external MCP-backed service use.
- Catalog entries include metadata such as category, auth mode, risk, mutation policy, readiness, and setup hints.
- Meta Ads is treated as high-risk marketing connector; read-only discovery can be allowed, mutations are blocked/approval-required by default.
- Figma has readiness guidance around desktop/remote setup.

### `src/modules/benchmark`

Owns Benchmark Lab from the CLI side.

Important services:

- `BenchmarkCommandsService`: slash command UI and flows.
- `BenchmarkRouteDiscoveryService`: discovers API endpoints/routes in Express, NestJS, Next.js, OpenAPI, etc.
- `BenchmarkExplicitTargetService`: resolves explicit mentions such as `/benchmark @router endpoint x` without broad discovery.
- `BenchmarkHarnessPlannerService`: decides whether direct HTTP, wrapper, or controlled environment is needed.
- `BenchmarkModelLocatorService`: finds model override points such as env vars, request body fields, or code factories.
- `BenchmarkRunnerService`: executes cases, budgets, summary, sandbox integration.
- `BenchmarkTargetService`: executes target types such as model_prompt, api_endpoint, agent_workflow, environment_task.
- `BenchmarkGraderService`: grades outputs using string contains, equality, regex, JSON schema, tool traces, and budget-gated LLM judge.
- `BenchmarkPlatformSyncService`: syncs definitions/runs/results/artifacts to backend.

User-approved behavior:

- If user provides explicit benchmark target via mention, do not run broad discovery first. Go straight to that file/target and inspect the flow.
- If user does not provide a target, run discovery and present candidates.
- Ask confirmation only if writing/changing files is needed.
- Offer migration to a separate controlled environment when a wrapper or code modifications are needed.

### `src/modules/sandbox`

Owns isolated execution and rollback support.

Backends:

- Docker sandbox when available/configured.
- Git worktree sandbox.
- Snapshot sandbox fallback.
- Noop sandbox for cases that do not require isolation.

Responsibilities:

- Redact artifacts.
- Preserve cwd.
- Capture diffs/artifacts.
- Roll back failed/non-passing benchmark runs when configured.
- Default Docker network to none unless explicitly allowed.

### `src/modules/scheduler`

Owns scheduled benchmark/task definitions from the CLI side.

Important services:

- `ScheduleCronService`: parses and computes cron next run.
- `SchedulePolicyService`: enforces budgets and mutation approval policy.
- `ScheduleRunnerService`: manually or automatically runs schedule targets under sandbox/budget controls.
- `SchedulePlatformSyncService`: syncs schedules/runs to platform without raw prompt/input content.
- `ScheduleStoreService`: local state persistence.
- `ScheduleSuggestionService`: proposes schedule ideas from environment/project context.

Target types include:

- benchmark
- environment_task
- agent_prompt
- rag_refresh
- shell_command

### `src/modules/state`

Owns local SQLite state.

Responsibilities:

- `state.db` migrations and pragmas.
- Local session summaries.
- Redacted message/tool call persistence.
- FTS search.
- Benchmark and schedule local tables are created through local state migrations.

Privacy:

- Local state can store redacted summaries/previews.
- Platform event sync should not persist raw prompt/output content.

### `src/modules/memory`

This is the CLI local memory module, separate from platform RAG/memory.

Responsibilities:

- Initialize local `MEMORY.md` and `USER.md` under the Cast home/project memory area.
- Block obvious prompt-injection/exfiltration memory writes.
- Provide local memory context where appropriate.

Do not confuse it with backend Memory API:

- CLI memory = local assistant memory.
- Platform Memory/RAG = project document/source retrieval over backend.

### Other CLI Modules

- `git`: status/diff/log/up/split-up/pr/review/fix/unit-test/release helpers.
- `diff`: diff utilities.
- `permissions`: file write and command permission gates.
- `mentions`: handles `@file`, `@dir`, `@git:diff`, etc.
- `snapshots`: checkpoint/rollback.
- `stats`: token/cost tracking and footer display.
- `replay`: session replay save/view.
- `vault`: code snippet vault.
- `remote`: local remote web interface.
- `kanban`: local task board.
- `watcher`: file change watcher that invalidates cached prompt/context.
- `i18n`: language changes and localized prompt/UI hooks.

## Platform and RAG Flow From CLI

Expected flow:

1. User configures global platform key with `/platform`.
2. CLI saves global key to `~/.cast/config.yaml`.
3. CLI writes project link to `.cast/cast.yaml`.
4. `PlatformService.bootstrap(projectRoot)` authenticates with backend and loads project payload.
5. Remote skills/agents/MCP summaries are adapted into local registries.
6. If project has RAG enabled, `rag_search` can call backend memory endpoints.
7. Agent answers can mark retrieved memory units as used.

Important failure modes:

- If backend is not running but cache exists, status can be `offline`, not `disabled`.
- If key missing, status should be clear and not try to fetch project.
- If RAG unavailable, `rag_search` should return a clear message instead of throwing.
- If tool input query is empty, use overview path rather than schema failure.

## Backend API Shape Used By CLI

Main endpoints used by CLI:

- `GET /v1/auth/me`
- `GET /v1/projects`
- `GET /v1/projects/:projectId`
- `POST /v1/sessions`
- `POST /v1/sessions/:sessionId/events`
- `PATCH /v1/sessions/:sessionId`
- `POST /v1/projects/:projectId/memory/retrieve`
- `GET /v1/projects/:projectId/memory/overview`
- `POST /v1/projects/:projectId/memory/usage`
- Benchmark and schedule sync endpoints under project routes.

Project payload must include:

- project metadata
- plan features
- active remote skills
- active remote agents
- benchmark access/definitions
- active environment/catalog/readiness
- schedule summaries
- RAG settings/status
- MCP summaries

## Web Integration Pointers

The platform web app should teach the same CLI commands:

- Use `cast platform --project <id> --api-url <url>` in snippets.
- Do not show `cast link` or `--api-key-env` in new UX.
- Project detail page uses `ProjectLinkCommand`.
- Landing hero includes a command snippet and should stay in sync with the CLI.

## Testing Expectations

Before claiming CLI work is complete:

- `npm run typecheck` in `cast-code`
- `npm test` in `cast-code`
- `npm run build` in `cast-code`

When platform integration touches backend/web too:

- `npm run typecheck` in `backend`
- `npm test` in `backend`
- `npm run build` in `backend`
- `npm run typecheck` in `web`
- `npm test` in `web`
- `npm run build` in `web`

Useful smoke commands:

- `node dist/main.js platform status`
- Interactive `npm run start:dev`, then `/help`, `/platform status`, `/skills`, and a simple prompt.
- Backend has `npm run smoke:curl`, `npm run smoke:cli`, `npm run smoke:rag`, `npm run smoke:security`.

Current validated state after recent fixes:

- `cast-code`: 311 tests passing, 1 skipped.
- `backend`: 99 tests passing.
- `web`: 45 tests passing.
- Builds/typechecks passed for all three packages.

## Current UX Decisions To Preserve

- `/platform` is the single setup flow for platform API URL, global key, and project link.
- `/config` should not contain platform setup.
- `/link` should not be advertised.
- Real API keys should not be saved in project manifests.
- `CAST_API_KEY` remains the default env name, but the key can live in global `~/.cast/config.yaml`.
- Agent should understand sibling workspace packages such as `../web` and `../backend`.
- RAG upload should accept pasted text and files: text, markdown, JSON-ish text, PDF, and DOCX.
- Web form failures should display form errors, not Next.js 500 pages.
- Benchmark target discovery should respect explicit mentions and avoid broad discovery when the user points to a file/route.
- File writes or wrapper generation for benchmarks require confirmation and should prefer controlled/sandboxed environments when possible.

## Common Gotchas

- The user often runs from `cast-code` but refers to sibling `../web` or `../backend`. Do not assume the current package is the whole workspace.
- `web` dev server defaults to port 3001. Backend `.env` currently uses port 3333, but previous local flows also used 3000/3002/3022 depending on smoke setup. Always verify env/port before hardcoding.
- `PlatformConfigService` has its own global config reader. Tests must isolate global config paths so the user's real `~/.cast/config.yaml` does not leak into test expectations.
- The `memory` package has a reusable MemoryService, but backend currently has the HTTP integration and database persistence.
- Generated build metadata such as `web/tsconfig.tsbuildinfo` should not be kept in diffs unless intentionally tracked.
- Do not commit unless the user explicitly asks.
