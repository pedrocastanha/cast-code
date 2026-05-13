# Cast Code Memory

Updated: 2026-05-13

This file is intended to be read by future assistant sessions before changing the Cast CLI. It summarizes what the system does, how the main modules fit together, and what decisions are important to preserve.

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

## Main CLI Runtime

Entry point: `src/main.ts`

Important startup behavior:

- Loads `.env` for local development only. Global npm users do not need a project `.env`.
- Supports direct `cast platform ...` command before entering REPL.
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

## Module Responsibilities

### `src/modules/core`

Owns the main AI agent runtime.

Key service:

- `DeepAgentService`: creates the DeepAgents/LangGraph agent, selects compact chat vs deep tool-using path, builds system prompts, wires local tools, MCP discovery tools, sub-agents, platform context, memory tools, environment context, stats, replay, and session tracking.

Important behavior:

- Short greetings and simple capability questions use a compact chat path without tools. This avoids wasting context and prevents fake file inspection.
- Real project work goes through the deep agent.
- DeepAgents built-in filesystem backend is wrapped by `WorkspaceFilesystemBackend`. Relative paths resolve from the active project root, but sibling directories inside the detected workspace root are allowed. This is why a prompt like "look at ../web" should work from `cast-code`.
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
- `/link` is removed from help/suggestions. If invoked, it prints a warning and points to `/platform`.
- `/config` should not manage Cast Platform anymore. It remains for model/provider/prompt config.
- `/help` should show `/platform` under "AGENTS, PROJECT, CONFIG".
- After successful `/platform`, `DeepAgentService.initialize()` is called again so remote skills/agents/RAG become available immediately.

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

