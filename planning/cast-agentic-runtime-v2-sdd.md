# SDD: Cast Agentic Runtime v2

## Purpose

This SDD maps `planning/cast-agentic-runtime-v2-prd.md` into concrete architecture, data contracts, files, commands, and test strategy. The design treats subagents, skills, and replay as one runtime:

- Subagents are durable runs with scoped inputs, lifecycle, artifacts, and trace events.
- Skills are scoped runtime records with explicit precedence, validation, reload, and activation reasons.
- Replay is backed by a local trace that records agent, skill, tool, permission, model, file, environment, and error events.

The implementation should be staged so each phase is useful on its own and does not require Cast Platform.

## Design Goals

- Keep local-first behavior. All runtime tracing, replay inspection, skill reload, and agent run inspection must work offline.
- Keep trace writing best-effort. A trace write failure should produce a warning event when possible, but must not break chat.
- Make every runtime decision explainable through `/agents`, `/skills`, `/replay`, or trace export.
- Preserve current command ergonomics and extend existing command services instead of introducing disconnected command surfaces.
- Use versioned data contracts for trace events, agent runs, skill runtime records, and replay exports.
- Reuse existing sanitization patterns from platform session tracking and extend them so secrets are redacted before persistence.
- Avoid historical or competitor-specific provenance labels in user-facing output, docs, telemetry, and command names.

## Current Architecture

### Agents

Current files:

```text
src/modules/agents/agents.module.ts
src/modules/agents/services/agent-loader.service.ts
src/modules/agents/services/agent-registry.service.ts
src/modules/agents/types/agent.types.ts
src/modules/agents/definitions/*.md
src/modules/repl/services/commands/agent-commands.service.ts
```

Current behavior:

- Agent definitions are markdown files with frontmatter.
- `AgentRegistryService.resolveAgent()` builds a resolved agent prompt, tools, MCP tools, and skill guidelines.
- `/agents` lists resolved agents.
- `/agents inspect <name>` shows basic definition details.
- There is no durable runtime run model for delegated work.

Design impact:

- Keep markdown agent definitions as the authoring format.
- Add runtime services beside the existing loader/registry.
- Extend `AgentDefinition` and `ResolvedAgent` with optional contract metadata while preserving current definitions.
- Add run inspection commands to the existing `AgentCommandsService`.

### Skills

Current files:

```text
src/modules/skills/skills.module.ts
src/modules/skills/services/skill-loader.service.ts
src/modules/skills/services/skill-registry.service.ts
src/modules/skills/services/skill-metadata-index.service.ts
src/modules/skills/services/skill-asset.service.ts
src/modules/skills/services/skill-runtime-tools.service.ts
src/modules/skills/services/skill-search.service.ts
src/modules/skills/types/skill.types.ts
src/modules/repl/services/commands/agent-commands.service.ts
```

Current behavior:

- Built-in, local, and remote skills are loaded into a map.
- Skill support files can be listed and viewed through runtime tools.
- Metadata index can enrich copied skill definitions.
- `/skills`, `/skills search`, `/skills inspect`, `/skills create`, and `/skills import` exist.
- There is no explicit runtime scope precedence record.
- Reload is effectively a process lifecycle operation, not a visible runtime command.

Design impact:

- Add a scope resolver without replacing the loader all at once.
- Add reload services that reparse one scope, validate before activation, and keep last valid versions.
- Extend inspect output with effective scope, shadowing, version, and reload state.

### Replay

Current files:

```text
src/modules/replay/replay.module.ts
src/modules/replay/services/replay.service.ts
src/modules/repl/services/commands/replay-commands.service.ts
```

Current behavior:

- `ReplayService` records simple user, assistant, and tool entries.
- Replays are saved as JSON files under `CAST_REPLAYS_DIR` or `~/.cast/replays`.
- `/replay save`, `/replay list`, and `/replay show` exist.
- Replay is a chat transcript, not a full runtime trace.

Design impact:

- Keep existing replay JSON compatibility.
- Add trace metadata to replay sessions.
- Read trace files for richer `/replay show` views.
- Add export and filtering without requiring a separate top-level command.

### Platform and State

Current files:

```text
src/modules/platform/services/session-tracker.service.ts
src/modules/platform/services/platform-client.service.ts
src/modules/state/services/local-session-store.service.ts
src/modules/stats/services/stats.service.ts
```

Current behavior:

- Platform tracking has event sanitization and optional remote sync.
- Local state exists for durable local records.
- Stats tracks token and cost summaries.

Design impact:

- Reuse sanitizer behavior, but move shared redaction logic into a local runtime service.
- Keep trace storage local by default.
- Optional platform sync can consume sanitized trace summaries later, but is not required for this SDD.

## Target Module Layout

### New Trace Module

```text
src/modules/trace/trace.module.ts
src/modules/trace/types/trace.types.ts
src/modules/trace/services/trace-context.service.ts
src/modules/trace/services/trace-writer.service.ts
src/modules/trace/services/trace-reader.service.ts
src/modules/trace/services/trace-export.service.ts
src/modules/trace/services/trace-sanitizer.service.ts
src/modules/trace/services/trace-retention.service.ts
src/modules/trace/services/trace-integrity.service.ts
```

Responsibilities:

- Own session ID and root run ID.
- Append trace events to local JSONL.
- Read and filter trace events.
- Export trace data as JSON or JSONL.
- Redact sensitive data before persistence.
- Validate trace integrity and tolerate partial/corrupt files.
- Apply retention and size policy.

### Agent Runtime Additions

```text
src/modules/agents/types/agent-runtime.types.ts
src/modules/agents/services/agent-run.service.ts
src/modules/agents/services/agent-delegation-planner.service.ts
src/modules/agents/services/agent-artifact-store.service.ts
src/modules/agents/services/agent-ownership.service.ts
src/modules/agents/services/agent-runtime-presenter.service.ts
```

Responsibilities:

- Create and update agent runs.
- Track lifecycle states.
- Enforce file ownership contracts.
- Persist structured artifacts.
- Emit trace events.
- Format runs for `/agents runs`, `/agents show`, and replay.

### Skill Runtime Additions

```text
src/modules/skills/types/skill-runtime.types.ts
src/modules/skills/services/skill-scope-resolver.service.ts
src/modules/skills/services/skill-version.service.ts
src/modules/skills/services/skill-validation.service.ts
src/modules/skills/services/skill-reload.service.ts
src/modules/skills/services/skill-watcher.service.ts
src/modules/skills/services/skill-runtime-presenter.service.ts
```

Responsibilities:

- Resolve effective skills across scopes.
- Track shadowed definitions and alias collisions.
- Hash skill content, support-file inventory, and metadata.
- Validate skills before activation.
- Reload one skill or all skills without restart.
- Watch project/user skill directories when enabled.
- Emit trace events for load, reload, injection, blocking, shadowing, and validation.

### Replay Additions

```text
src/modules/replay/types/replay-query.types.ts
src/modules/replay/services/replay-query.service.ts
src/modules/replay/services/replay-presenter.service.ts
```

Responsibilities:

- Join replay entries with trace events.
- Render summary, timeline, agent, skill, tool, and error sections.
- Filter by run ID, agent, skill, event type, and error-only mode.
- Support deterministic export through trace services.

## Data Contracts

### Trace Event

Path:

```text
src/modules/trace/types/trace.types.ts
```

Contract:

```ts
export type TraceSchemaVersion = 1;

export type TraceEventType =
  | 'session.started'
  | 'session.ended'
  | 'session.warning'
  | 'agent.queued'
  | 'agent.started'
  | 'agent.tool_call'
  | 'agent.permission_wait'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.cancelled'
  | 'agent.timed_out'
  | 'skill.loaded'
  | 'skill.changed'
  | 'skill.reloaded'
  | 'skill.invalid'
  | 'skill.shadowed'
  | 'skill.injected'
  | 'skill.blocked'
  | 'skill.removed'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  | 'permission.requested'
  | 'permission.granted'
  | 'permission.denied'
  | 'model.requested'
  | 'model.completed'
  | 'file.changed'
  | 'env.activated'
  | 'memory.read'
  | 'memory.written'
  | 'error.raised'
  | 'eval.observed';

export interface TraceEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  schemaVersion: TraceSchemaVersion;
  eventId: string;
  sessionId: string;
  runId: string;
  parentRunId?: string;
  timestamp: string;
  type: TraceEventType;
  payload: TPayload;
  redactions: TraceRedaction[];
}

export interface TraceRedaction {
  path: string;
  reason: 'secret_pattern' | 'large_output' | 'binary_output' | 'policy';
}
```

Implementation notes:

- `timestamp` uses ISO 8601 strings for stable export and human readability.
- `eventId` should be monotonic enough for deterministic sorting. Use `sessionId:counter` or a small local monotonic ID service.
- Trace payloads must be sanitized before append.
- Unknown future event types should be preserved by reader/export services and rendered as generic events.

### Trace Storage

Default layout:

```text
~/.cast/replays/
  _current.json
  <saved-replay>.json
  traces/
    <session-id>/
      trace.jsonl
      artifacts/
        <run-id>.json
```

Environment overrides:

- `CAST_REPLAYS_DIR` keeps controlling replay root.
- `CAST_TRACE_DIR` can override trace root for tests and advanced users.

Rationale:

- Storing traces under the replay root makes `/replay` self-contained.
- `CAST_TRACE_DIR` lets E2E tests isolate traces without changing user replay behavior.

### Replay Session Extension

Modify:

```text
src/modules/replay/services/replay.service.ts
```

Extend `ReplaySession`:

```ts
export interface ReplaySession {
  id: string;
  name?: string;
  project: string;
  model: string;
  createdAt: number;
  entries: ReplayEntry[];
  trace?: ReplayTraceRef;
}

export interface ReplayTraceRef {
  schemaVersion: 1;
  sessionId: string;
  rootRunId: string;
  tracePath: string;
  events: number;
}
```

Backward compatibility:

- If `trace` is missing, `/replay show` should render the current transcript-only view and show a muted message: `No trace data recorded for this replay.`
- Saving a replay should not rewrite older replay files unless the current session is being saved.

### Agent Runtime Contracts

Path:

```text
src/modules/agents/types/agent-runtime.types.ts
```

Contracts:

```ts
export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_permission'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface AgentRun {
  id: string;
  parentRunId: string;
  agentName: string;
  status: AgentRunStatus;
  task: string;
  inputContract: AgentInputContract;
  skills: AgentRunSkill[];
  tools: AgentRunTool[];
  artifacts: AgentRunArtifact[];
  errors: AgentRunError[];
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  tokenUsage?: AgentRunTokenUsage;
}

export interface AgentInputContract {
  prompt: string;
  fileOwnership: AgentFileOwnership[];
  toolScope: string[];
  requiredSkills: string[];
  expectedOutput: AgentOutputSchema;
  acceptanceCriteria: string[];
}

export interface AgentFileOwnership {
  path: string;
  mode: 'read' | 'write' | 'shared';
}

export interface AgentOutputSchema {
  kind: 'analysis' | 'patch' | 'test_report' | 'review' | 'implementation_plan' | 'custom';
  requiredSections: string[];
}

export interface AgentRunSkill {
  name: string;
  scope: SkillRuntimeScope;
  version: string;
  reason: 'agent_required' | 'task_match' | 'manual' | 'environment' | 'profile';
}

export interface AgentRunTool {
  name: string;
  reason: 'agent_default' | 'skill_tool' | 'mcp' | 'fallback';
}

export interface AgentRunArtifact {
  kind: 'final_answer' | 'changed_files' | 'test_result' | 'handoff' | 'blocker';
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRunError {
  message: string;
  code?: string;
  recoverable: boolean;
}

export interface AgentRunTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}
```

Agent definition extension:

```ts
export interface AgentFrontmatter {
  name: string;
  description: string;
  model?: string;
  temperature?: number;
  skills: string[];
  mcp?: string[];
  environments?: string[];
  profiles?: string[];
  tags?: string[];
  ownership?: AgentDefaultOwnership[];
  defaultTools?: string[];
  outputSchema?: AgentOutputSchema;
  timeoutMs?: number;
  maxTokens?: number;
}
```

Compatibility:

- Existing agent definitions remain valid.
- Missing contract fields use defaults:
  - `ownership`: empty read-only scope.
  - `defaultTools`: resolved from current skill/tool behavior.
  - `outputSchema`: `custom` with sections `Summary`, `Evidence`, `Next Steps`.
  - `timeoutMs`: 15 minutes for MVP.
  - `maxTokens`: provider/model default.

### Skill Runtime Contracts

Path:

```text
src/modules/skills/types/skill-runtime.types.ts
```

Contracts:

```ts
export type SkillRuntimeScope = 'builtin' | 'remote' | 'user' | 'project' | 'session';

export type SkillRuntimeStatus =
  | 'active'
  | 'shadowed'
  | 'disabled'
  | 'quarantined'
  | 'invalid'
  | 'reloading';

export type SkillActivationReason =
  | 'manual'
  | 'mention'
  | 'environment'
  | 'profile'
  | 'agent_required'
  | 'dynamic_recommendation';

export interface SkillRuntimeRecord {
  name: string;
  aliases: string[];
  scope: SkillRuntimeScope;
  sourcePath?: string;
  packageRoot?: string;
  version: string;
  status: SkillRuntimeStatus;
  activationReasons: SkillActivationReason[];
  supportFiles: SkillRuntimeSupportFile[];
  shadowedBy?: SkillRuntimeRef;
  shadows: SkillRuntimeRef[];
  reload: SkillReloadState;
}

export interface SkillRuntimeRef {
  name: string;
  scope: SkillRuntimeScope;
  sourcePath?: string;
  version?: string;
}

export interface SkillRuntimeSupportFile {
  path: string;
  bytes: number;
  readable: boolean;
  reason?: 'too_large' | 'binary' | 'path_blocked';
}

export interface SkillReloadState {
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  changedFiles: string[];
  warnings: string[];
  errors: string[];
}
```

Scope mapping:

- Current `source: 'builtin'` maps to runtime `builtin`.
- Current `source: 'remote'` maps to runtime `remote`.
- Current `source: 'local'` maps to runtime `project` when loaded from `.cast/skills` under the repo.
- Current `source: 'local'` maps to runtime `user` when loaded from the user skill directory.
- `session` is reserved for temporary injected skills or future runtime-only definitions.

Precedence:

```text
session > project > user > remote > builtin
```

Conflict rules:

- Same canonical name across scopes: highest precedence becomes `active`, lower precedence records become `shadowed`.
- Same alias across two active records: alias becomes invalid until one record is disabled or renamed.
- Quarantined or disabled records cannot become active through precedence alone.
- Invalid reload cannot replace the last valid active record.

## Service Designs

### TraceContextService

Path:

```text
src/modules/trace/services/trace-context.service.ts
```

Responsibilities:

- Create session ID and root run ID at REPL startup.
- Provide current trace context to replay, agents, skills, tools, permissions, and model calls.
- Generate child run IDs.
- Keep a lightweight in-memory counter for deterministic event IDs.

Key methods:

```ts
startSession(input: { project: string; model?: string }): TraceContext;
getCurrent(): TraceContext;
createChildRun(parentRunId: string, label: string): string;
nextEventId(): string;
endSession(summary: Record<string, unknown>): void;
```

### TraceWriterService

Path:

```text
src/modules/trace/services/trace-writer.service.ts
```

Responsibilities:

- Sanitize payloads before persistence.
- Append JSONL records.
- Flush after important events and at process close.
- Keep event count and current trace file path.
- Emit process warnings instead of throwing for non-critical IO failures.

Key methods:

```ts
append<T extends Record<string, unknown>>(event: Omit<TraceEvent<T>, 'schemaVersion' | 'timestamp' | 'redactions'>): void;
flush(): Promise<void>;
getCurrentTraceRef(): ReplayTraceRef;
```

Write policy:

- `session.started`, `agent.started`, `agent.completed`, `agent.failed`, `skill.reloaded`, and `error.raised` flush immediately.
- High-volume events such as `tool.completed` can be buffered for a short interval.
- Tests use `CAST_TRACE_DIR` and force synchronous flush.

### TraceSanitizerService

Path:

```text
src/modules/trace/services/trace-sanitizer.service.ts
```

Responsibilities:

- Redact secrets before persistence.
- Truncate large strings and tool outputs.
- Mark redactions with JSON paths.
- Reuse platform session sanitizer patterns and expand them for local trace payloads.

Secret patterns:

- Environment variables containing `TOKEN`, `KEY`, `SECRET`, `PASSWORD`, `CREDENTIAL`, or `AUTH`.
- Bearer tokens.
- GitHub tokens.
- OpenAI-compatible API keys.
- AWS access keys.
- Private key blocks.
- Basic auth headers.

Default limits:

- 32 KB per string field.
- 128 KB per event after sanitization.
- Binary output is replaced with `[binary output redacted]`.

### AgentRunService

Path:

```text
src/modules/agents/services/agent-run.service.ts
```

Responsibilities:

- Create, update, and query `AgentRun` records.
- Emit lifecycle trace events.
- Persist final artifacts under trace artifact directory.
- Expose active and recent runs.
- Enforce allowed state transitions.

State transitions:

```text
queued -> running
running -> waiting_for_permission
waiting_for_permission -> running
running -> completed
running -> failed
running -> cancelled
running -> timed_out
queued -> cancelled
```

Invalid transitions should return a typed result:

```ts
type AgentRunUpdateResult =
  | { ok: true; run: AgentRun }
  | { ok: false; error: 'not_found' | 'invalid_transition' | 'already_terminal'; message: string };
```

### AgentOwnershipService

Path:

```text
src/modules/agents/services/agent-ownership.service.ts
```

Responsibilities:

- Normalize file ownership paths to repo-relative paths.
- Reject absolute paths and `..` escapes.
- Detect overlapping write scopes across active runs.
- Allow overlap only when every overlapping owner marks the path as `shared`.

Overlap examples:

- `src/modules/skills` conflicts with `src/modules/skills/services/foo.ts`.
- `src/modules/skills/*.ts` conflicts with `src/modules/skills/skill.ts` when glob support is added.
- Read/read overlap is allowed.
- Read/write overlap is allowed only if the read owner is explicitly read-only.
- Write/write overlap requires `shared`.

### AgentDelegationPlannerService

Path:

```text
src/modules/agents/services/agent-delegation-planner.service.ts
```

Responsibilities:

- Decide whether delegation is useful.
- Recommend agents and scoped contracts.
- Explain no-delegation decisions.
- Avoid duplicate agents with overlapping responsibilities.

MVP behavior:

- Rule-based planner using prompt intent, environment/profile, available agents, required skills, and file ownership hints.
- Emits `agent.queued` only when dispatch is actually requested by the main model or command layer.
- Provides a model-facing tool summary through discovery tools.

### SkillScopeResolverService

Path:

```text
src/modules/skills/services/skill-scope-resolver.service.ts
```

Responsibilities:

- Group loaded definitions by canonical name and alias.
- Apply precedence.
- Return effective records and shadowed records.
- Explain why a skill is active, shadowed, invalid, disabled, or quarantined.

Key methods:

```ts
resolveAll(input: SkillScopeInput): SkillRuntimeResolution;
resolveSkill(name: string, input: SkillScopeInput): SkillRuntimeRecord | undefined;
getConflicts(input: SkillScopeInput): SkillRuntimeConflict[];
```

### SkillVersionService

Path:

```text
src/modules/skills/services/skill-version.service.ts
```

Responsibilities:

- Compute stable hashes for:
  - normalized `SKILL.md` content
  - frontmatter
  - support-file inventory
  - sidecar metadata
- Use SHA-256 and return short display hashes plus full hashes for trace/export.

Version rule:

- `version` changes when model-visible content or support-file inventory changes.
- `metadataVersion` changes when policy metadata changes.
- `reloadVersion` can increment on every successful reload for human display.

### SkillValidationService

Path:

```text
src/modules/skills/services/skill-validation.service.ts
```

Responsibilities:

- Validate frontmatter shape.
- Validate canonical name and aliases.
- Validate support-file paths stay under package root.
- Validate risk/trust/activation policy.
- Validate environment/profile references.
- Validate size and binary-file limits.

Result:

```ts
export interface SkillValidationResult {
  ok: boolean;
  errors: SkillValidationIssue[];
  warnings: SkillValidationIssue[];
}

export interface SkillValidationIssue {
  code: string;
  message: string;
  path?: string;
}
```

### SkillReloadService

Path:

```text
src/modules/skills/services/skill-reload.service.ts
```

Responsibilities:

- Reload one skill by name or all skill scopes.
- Validate before activating.
- Keep last valid version active if reload fails.
- Update runtime records and alias maps atomically.
- Emit trace events:
  - `skill.changed`
  - `skill.reloaded`
  - `skill.invalid`
  - `skill.shadowed`
  - `skill.removed`

Atomic reload approach:

1. Parse changed files into a temporary loader state.
2. Validate all affected records.
3. Resolve scopes and conflicts.
4. If validation passes, swap active state.
5. If validation fails, keep current state and store reload errors.

### SkillWatcherService

Path:

```text
src/modules/skills/services/skill-watcher.service.ts
```

Responsibilities:

- Watch project `.cast/skills/` and user skill directories when enabled.
- Debounce rapid file changes.
- Trigger reload through `SkillReloadService`.
- Report watcher status in `/skills watch status`.

MVP dependency:

- Use Node `fs.watch` first.
- Add `chokidar` only if native watching proves unreliable across supported platforms.

### ReplayQueryService

Path:

```text
src/modules/replay/services/replay-query.service.ts
```

Responsibilities:

- Load replay JSON and associated trace events.
- Filter by run ID, agent, skill, tool, event type, and errors.
- Build summary sections for presenter.
- Preserve transcript-only compatibility.

Query input:

```ts
export interface ReplayQuery {
  name: string;
  timeline?: boolean;
  agents?: boolean;
  skills?: boolean;
  tools?: boolean;
  errors?: boolean;
  runId?: string;
  agentName?: string;
  skillName?: string;
}
```

### ReplayPresenterService

Path:

```text
src/modules/replay/services/replay-presenter.service.ts
```

Responsibilities:

- Format replay output for terminal panels.
- Keep default output compact.
- Render sections only when requested through flags.
- Surface trace integrity warnings.

Default `/replay show <name>` sections:

- Details.
- Summary.
- Preview.
- Trace availability.

Flag sections:

- `--timeline`
- `--agents`
- `--skills`
- `--tools`
- `--errors`

## Command Design

### `/agents`

Modify:

```text
src/modules/repl/services/commands/agent-commands.service.ts
```

Add subcommands:

```text
/agents runs
/agents show <run-id>
/agents cancel <run-id>
```

Rendering:

- `/agents runs` shows active and recent runs sorted by latest update.
- `/agents show <run-id>` shows task, status, selected skills, tool scope, ownership, artifacts, errors, token/cost, and trace link.
- `/agents cancel <run-id>` requests cancellation through `AgentRunService` and records the final state.

Integration:

- Keep `/agents` and `/agents inspect <name>` behavior.
- Extend inspect to show runtime contract fields when present.

### `/skills`

Modify:

```text
src/modules/repl/services/commands/agent-commands.service.ts
```

The current file owns both agent and skill commands. Keep this for MVP to avoid command routing churn, but split later if it grows too large.

Add subcommands:

```text
/skills reload <name>
/skills reload --all
/skills watch on
/skills watch off
/skills watch status
/skills inspect <name> --effective
/skills conflicts
```

Rendering:

- Reload success shows name, active scope, version, changed files, warnings, and trace event count.
- Reload failure shows validation errors and confirms the previous valid version remains active.
- Effective inspect shows active record, shadowed records, aliases, source path, package root, support files, risk/trust, activation policy, and reload state.
- Conflicts shows duplicate names and aliases grouped by scope.

### `/replay`

Modify:

```text
src/modules/repl/services/commands/replay-commands.service.ts
```

Add parsing for:

```text
/replay show <name> --timeline
/replay show <name> --agents
/replay show <name> --skills
/replay show <name> --tools
/replay show <name> --errors
/replay show <name> --agent <run-id>
/replay export <name> --format json
/replay export <name> --format jsonl
```

Parsing notes:

- Keep names with spaces working for `save` and `show`.
- Parse flags from the end of the command so `show my session --timeline` treats `my session` as the name.
- `current` maps to `_current.json`.

## Tool Integration

Modify:

```text
src/modules/tools/services/discovery-tools.service.ts
src/modules/tools/services/tools-registry.service.ts
```

Model-facing additions:

- `list_agent_runs`: read-only tool returning active and recent run summaries.
- `show_agent_run`: read-only tool returning one run.
- `dispatch_agent`: controlled tool for creating a run with explicit contract.
- `list_skill_conflicts`: read-only tool for scope/alias conflicts.
- Extend `read_skill` and `skill_view` responses with scope and version.

Guardrails:

- `dispatch_agent` requires a non-empty task and explicit ownership.
- `dispatch_agent` must route through permission/confirmation policy if the host UI requires approval.
- Tool output should include trace run IDs so replay can link model decisions to runtime objects.

## Lifecycle Flows

### Chat Session Start

1. REPL starts.
2. `TraceContextService.startSession()` creates `sessionId` and `rootRunId`.
3. `TraceWriterService` appends `session.started`.
4. `ReplayService` creates current replay with trace ref.
5. Environment/profile activation emits `env.activated` when available.

### Skill Reload

1. User runs `/skills reload api-contracts`.
2. `SkillReloadService` finds records matching name or alias.
3. Parser loads candidate files into temporary state.
4. `SkillValidationService` validates candidate.
5. `SkillScopeResolverService` computes effective record and shadowing.
6. Successful reload swaps active state and emits `skill.reloaded`.
7. Failed reload records errors, emits `skill.invalid`, and keeps last valid record.
8. `/skills inspect api-contracts --effective` shows updated state.

### Subagent Dispatch

1. Main model or command layer requests delegation.
2. `AgentDelegationPlannerService` creates a proposed contract.
3. `AgentOwnershipService` validates file ownership.
4. `AgentRunService.createRun()` creates `queued` run and emits `agent.queued`.
5. Runtime starts agent, resolves tools/skills, and emits `agent.started`.
6. Tool, permission, model, and file events are linked to the child `runId`.
7. Completion stores artifacts and emits `agent.completed`.
8. `/agents show <run-id>` renders the durable result.

### Replay Inspection

1. User runs `/replay show session-name --timeline --agents`.
2. `ReplayService` loads replay JSON.
3. `ReplayQueryService` loads trace events from replay trace ref.
4. `TraceIntegrityService` validates order, parseability, and required fields.
5. `ReplayPresenterService` renders requested sections.
6. Missing trace data falls back to transcript-only output.

## Persistence Strategy

### MVP

- Store trace events as JSONL files.
- Store agent artifacts as JSON files under the trace session artifact directory.
- Store replay JSON as today, with added trace ref.
- Keep in-memory indexes for active agent runs and skill runtime records.

### Later

- Mirror trace summaries into `LocalSessionStore` for fast cross-session search.
- Add compaction for old traces.
- Add remote sync of sanitized summaries through platform config.

## Error Handling

Trace writer:

- IO append failure logs one `session.warning` if possible and continues.
- Serialization failure sanitizes payload into `error.raised` with a safe message.

Skill reload:

- Invalid file keeps previous valid version.
- Missing skill name returns command error without mutating runtime state.
- Watcher failure disables watch mode and surfaces status.

Agent runs:

- Agent execution error records `agent.failed`.
- Timeout records `agent.timed_out`.
- Cancellation records `agent.cancelled`.
- Terminal runs cannot be updated except by attaching late diagnostic artifacts.

Replay:

- Corrupt trace line is skipped with integrity warning.
- Missing trace file renders transcript-only replay with warning.
- Export fails if target path cannot be written and leaves no partial named export.

## Testing Strategy

### Unit Tests

Trace:

```bash
node --test -r ts-node/register src/modules/trace/**/*.spec.ts
```

Agents:

```bash
node --test -r ts-node/register src/modules/agents/**/*.spec.ts
node --test -r ts-node/register src/modules/repl/services/commands/agent-commands.service.spec.ts
```

Skills:

```bash
node --test -r ts-node/register src/modules/skills/**/*.spec.ts
node --test -r ts-node/register src/modules/skills-import/**/*.spec.ts
```

Replay:

```bash
node --test -r ts-node/register src/modules/replay/**/*.spec.ts
node --test -r ts-node/register src/modules/repl/services/commands/replay-commands.service.spec.ts
```

### Integration Tests

```bash
node --test -r ts-node/register src/modules/core/services/deep-agent.service.spec.ts
node --test -r ts-node/register src/modules/tools/**/*.spec.ts
node --test -r ts-node/register src/modules/platform/services/session-tracker.service.spec.ts
```

### End-to-End Smoke

Add:

```text
scripts/agentic-runtime-v2-smoke.mjs
```

Required assertions:

- `npm run build` succeeds before smoke starts.
- CLI starts in a temp project with isolated `CAST_REPLAYS_DIR` and `CAST_TRACE_DIR`.
- `/skills reload --all` returns success or structured validation output.
- A project skill can be edited and reloaded without restart.
- A read-only delegated task creates at least one agent run.
- `/agents runs` includes that run.
- `/agents show <run-id>` includes task, status, skills, tools, and trace link.
- `/replay save agentic-runtime-v2-smoke` succeeds.
- `/replay show agentic-runtime-v2-smoke --timeline --agents --skills --tools` includes required event families.
- `/replay export agentic-runtime-v2-smoke --format jsonl` creates deterministic JSONL.
- Export contains no raw secret fixture values.

### Golden Evals

Add fixtures:

```text
evals/fixtures/agentic-runtime-v2/
  subagent-selection.json
  subagent-no-delegation.json
  skill-reload.json
  skill-conflict.json
  replay-completeness.json
  redaction.json
```

Eval checks:

- Correct agent selected for a task.
- No delegation when a task is too small or tightly coupled.
- Reloaded skill version is injected after successful reload.
- Skill conflict explanation names active and shadowed scopes.
- Replay contains required event families.
- Secret fixture values are redacted before persistence.

### Full Verification

```bash
npm run typecheck
npm test
npm run build
node scripts/agentic-runtime-v2-smoke.mjs
npm pack --dry-run
```

## Implementation Phases

### Phase 1: Trace Foundation

Files:

- Create `src/modules/trace/**`.
- Modify `src/app.module.ts`.
- Modify `src/modules/replay/services/replay.service.ts`.
- Modify `src/modules/repl/services/commands/replay-commands.service.ts`.

Deliverables:

- Local JSONL trace writer.
- Trace context with session and root run IDs.
- Replay trace ref.
- `/replay show current --timeline`.
- Sanitizer and trace schema tests.

### Phase 2: Agent Runs

Files:

- Create `src/modules/agents/types/agent-runtime.types.ts`.
- Create `src/modules/agents/services/agent-run.service.ts`.
- Create `src/modules/agents/services/agent-artifact-store.service.ts`.
- Create `src/modules/agents/services/agent-ownership.service.ts`.
- Create `src/modules/agents/services/agent-runtime-presenter.service.ts`.
- Modify `src/modules/agents/agents.module.ts`.
- Modify `src/modules/agents/types/agent.types.ts`.
- Modify `src/modules/repl/services/commands/agent-commands.service.ts`.

Deliverables:

- Agent run lifecycle.
- `/agents runs`.
- `/agents show <run-id>`.
- `/agents cancel <run-id>`.
- Trace events for agent lifecycle.

### Phase 3: Skill Runtime and Reload

Files:

- Create `src/modules/skills/types/skill-runtime.types.ts`.
- Create `src/modules/skills/services/skill-scope-resolver.service.ts`.
- Create `src/modules/skills/services/skill-version.service.ts`.
- Create `src/modules/skills/services/skill-validation.service.ts`.
- Create `src/modules/skills/services/skill-reload.service.ts`.
- Create `src/modules/skills/services/skill-watcher.service.ts`.
- Create `src/modules/skills/services/skill-runtime-presenter.service.ts`.
- Modify `src/modules/skills/skills.module.ts`.
- Modify `src/modules/skills/services/skill-loader.service.ts`.
- Modify `src/modules/skills/services/skill-registry.service.ts`.
- Modify `src/modules/repl/services/commands/agent-commands.service.ts`.
- Modify `src/modules/repl/services/repl.service.ts`.

Deliverables:

- Scope precedence.
- Effective inspect.
- Reload one/all.
- Watch on/off/status.
- Conflict reporting.
- Trace events for skill runtime decisions.

### Phase 4: Replay v2

Files:

- Create `src/modules/replay/types/replay-query.types.ts`.
- Create `src/modules/replay/services/replay-query.service.ts`.
- Create `src/modules/replay/services/replay-presenter.service.ts`.
- Modify `src/modules/replay/services/replay.service.ts`.
- Modify `src/modules/repl/services/commands/replay-commands.service.ts`.

Deliverables:

- Timeline, agents, skills, tools, and errors sections.
- Run/agent/skill filters.
- JSON and JSONL export.
- Integrity warnings.
- Transcript-only compatibility.

### Phase 5: Integrated E2E and Evals

Files:

- Create `scripts/agentic-runtime-v2-smoke.mjs`.
- Create `evals/fixtures/agentic-runtime-v2/*.json`.
- Extend existing eval runner or add a small runtime-specific eval command.
- Update README command reference after implementation is stable.

Deliverables:

- End-to-end CLI proof.
- Golden evals for agent selection, skill reload, conflict explanation, replay completeness, and redaction.
- Release verification checklist.

## Migration and Compatibility

- Existing replay files continue to load.
- Existing skill definitions continue to load.
- Existing agent definitions continue to load.
- Existing `/agents`, `/skills`, and `/replay` default views remain compact.
- Trace data starts only for sessions created after this feature ships.
- Existing local skill source values are mapped into runtime scopes by path.
- Platform session tracking remains optional and independent.

## Performance Budget

- Trace append target: under 5 ms per event on local disk for normal payloads.
- Trace sanitization target: under 2 ms for typical event payloads.
- Skill reload one skill target: under 250 ms for normal markdown plus support-file inventory.
- `/skills reload --all` target: under 2 seconds for current catalog on a warm filesystem.
- `/replay show --timeline` target: under 500 ms for 5,000 events.
- Default command output should cap displayed events and explain how to export full data.

## Security and Privacy

- Redaction happens before writing trace files.
- Replay export uses already-sanitized trace data.
- Debug redaction profiles can include larger local outputs, but still redact secrets.
- Skill reload never executes scripts or shell commands.
- Watch mode only reads files under configured skill roots.
- Agent file ownership paths are repo-relative and path traversal is rejected.
- Destructive tool calls still route through existing permission policy.

## Open Decisions for Implementation

- Whether to keep skill commands inside `AgentCommandsService` for all phases or split a dedicated `SkillCommandsService` during Phase 3.
- Whether `TraceWriterService` should use synchronous writes for simplicity or buffered async writes for lower overhead.
- Whether agent artifacts should be referenced only from trace files or also indexed in local SQLite.
- Whether skill watch mode should persist per project or remain session-only for MVP.

## Release Checklist

- New SDD-aligned tests pass.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- `node scripts/agentic-runtime-v2-smoke.mjs` passes.
- `npm pack --dry-run` passes.
- Manual CLI smoke validates:
  - `/skills reload --all`
  - `/skills inspect <name> --effective`
  - `/skills conflicts`
  - `/agents runs`
  - `/agents show <run-id>`
  - `/replay show <name> --timeline --agents --skills --tools --errors`
  - `/replay export <name> --format jsonl`
- Trace export contains no raw secret fixture values.
- User-facing docs and command output avoid provenance labels unrelated to Cast runtime behavior.
