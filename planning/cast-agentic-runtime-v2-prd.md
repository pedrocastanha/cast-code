# PRD: Cast Agentic Runtime v2

## Summary

Cast should make delegation, skill activation, and debugging one integrated runtime instead of three separate feature lists. This PRD defines a single roadmap for:

- Subagents v2: stronger delegation, lifecycle, contracts, and handoffs.
- Skill runtime v2: scopes, hot reload, dynamic injection, and conflict handling.
- Observability and replay v2: local traces that explain what happened, why it happened, and how to inspect it after the fact.

The product direction is:

- Agents are task owners with explicit inputs, budgets, tools, skills, status, and output artifacts.
- Skills are scoped runtime capabilities that can be listed, inspected, activated, reloaded, versioned, and governed without restarting Cast.
- Every meaningful agent, skill, model, permission, and tool decision is recorded into a local trace that can be inspected through `/replay`, exported, and used by evals.

## Problem

Cast already has agents, skills, replay, stats, platform session tracking, local state, and command UX. The next product gap is not just adding more definitions. The gap is making those pieces behave as one debuggable runtime.

Current limitations:

- Subagents are mostly definitions plus dispatch guidance. The user cannot easily inspect a subagent run, cancel it, replay it, compare outputs, or see which skills and tools it received.
- Agent delegation has weak contracts. It is hard to enforce ownership, expected output shape, tool scope, file scope, and integration handoff quality.
- Skills can be loaded and inspected, but skill authoring still often requires restarting or manually checking whether the runtime picked up a change.
- Skill scope precedence is not visible enough when built-in, local, project, and remote definitions collide.
- Replay captures chat entries, but it does not yet explain the full agentic chain: skill injection, agent spawning, tool calls, permission decisions, environment/profile context, token/cost deltas, file edits, and errors.
- Debugging a failed session requires piecing together terminal logs, replay files, git diff, and memory of what happened.

## Goals

- Make subagents first-class runtime objects with run IDs, lifecycle states, scoped context, artifacts, and inspectable results.
- Support reliable parallel delegation with clear ownership and integration handoffs.
- Add skill scopes and hot reload so local/project skill iteration works without restarting Cast.
- Make skill activation explainable: why a skill was suggested, injected, blocked, shadowed, or reloaded.
- Upgrade replay into a trace-backed session inspector for agents, skills, tools, permissions, costs, and outcomes.
- Keep all traces local by default, with explicit redaction and opt-in sync only when platform config enables it.
- Provide evals and smoke tests that prove the runtime works through real CLI chat flows, not only unit tests.

## Non-Goals

- Do not build a web dashboard in this PRD.
- Do not require Cast Platform for local traces, skill reload, or subagent runtime behavior.
- Do not expose secrets or raw environment variables in traces.
- Do not run skill scripts automatically during reload.
- Do not make every task use subagents. Delegation should be chosen when it improves outcome quality or latency.
- Do not preload all skills into every prompt.
- Do not add competitor-specific naming or historical package labels to commands, docs, telemetry, or UI.

## Users

- Solo developer using Cast inside a local repo and wanting reliable delegation.
- Power user authoring project-specific skills in `.cast/skills/`.
- Team lead curating shared agents and skills for a codebase.
- Cast maintainer investigating regressions in agent selection, skill injection, or tool behavior.
- QA/eval runner validating that end-to-end sessions are reproducible enough to debug.

## Success Metrics

- A delegated task produces a visible run ID, status timeline, selected skills, tool usage summary, and final artifact.
- A user can edit a project skill, run `/skills reload <name>` or use skill watch mode, and see the changed skill without restarting Cast.
- `/skills inspect <name>` shows effective source, scope, shadowing, aliases, support files, risk, trust, activation policy, and last reload result.
- `/replay show <session>` can display parent/child agent runs, injected skills, tool calls, permission decisions, file edits, errors, token/cost deltas, and final outcome.
- A failed tool call or failed subagent run is traceable to a concrete error event with enough context to reproduce the issue.
- Golden evals catch wrong skill injection, wrong subagent selection, missing trace events, and replay schema regressions.
- E2E smoke tests can start Cast, interact with chat, trigger delegation, reload a skill, save a replay, and inspect the trace.

## Product Principles

- Explainability over magic: the user should be able to ask why an agent or skill was used.
- Scoped power: agents and skills get only the context, tools, and permissions they need for the task.
- Local-first observability: traces work offline and are stored under user-controlled paths.
- Privacy by default: sensitive values are redacted before persistence.
- Stable contracts: traces, agent runs, and skill records use versioned schemas.
- Fast feedback: skill authoring and agent debugging should not require restarting the CLI.

## Current Architecture Touchpoints

- `src/modules/agents`: agent definitions, loading, registry, and current subagent types.
- `src/modules/skills`: skill loader, registry, metadata index, support-file tools, search, and runtime tools.
- `src/modules/replay`: current replay session recording and `/replay` storage.
- `src/modules/state`: local SQLite state and durable local records.
- `src/modules/platform`: optional session/event sync and sanitization patterns.
- `src/modules/repl`: slash commands, chat loop, smart input, and command UI.
- `src/modules/tools`: tool registry, discovery tools, filesystem/search/shell tools, and runtime tool wrappers.
- `src/modules/permissions`: permission prompts and session rules.
- `src/modules/environments`: environment/profile resolution and scoped runtime context.
- `src/modules/stats`: token/cost tracking that should be linked into trace summaries.

## Primary Workflows

### Workflow 1: Delegated Feature Work

The user asks Cast to implement a backend feature. Cast decides to delegate API design, database changes, and test verification to separate agents. Each agent receives a scoped task, relevant skills, explicit file ownership, and an output contract. The user can inspect run status while work is active and review each result before final integration.

Expected commands:

```text
/agents runs
/agents inspect api-engineer
/agents show <run-id>
/replay show current --agents --skills --tools
```

### Workflow 2: Live Skill Authoring

The user creates or edits `.cast/skills/backend/api-contracts/SKILL.md`. Cast reloads it without restart, reports validation errors if frontmatter or support-file paths are invalid, and updates `$` suggestions plus skill injection.

Expected commands:

```text
/skills watch on
/skills reload api-contracts
/skills inspect api-contracts
```

### Workflow 3: Debugging a Bad Session

The user asks why a previous run used the wrong skill or why a subagent produced weak output. Cast shows a replay timeline with the environment/profile, skill candidates, selected skills, rejected skills, delegation decisions, tool calls, permission outcomes, errors, and final artifacts.

Expected commands:

```text
/replay list
/replay show <name> --timeline
/replay show <name> --agent <run-id>
/replay export <name> --format jsonl
```

## Runtime Model

### Agent Run

An agent run is the durable record of delegated work.

Required fields:

- `id`: stable run ID.
- `parentRunId`: root session run or parent agent run.
- `agentName`: resolved agent definition.
- `status`: `queued`, `running`, `waiting_for_permission`, `completed`, `failed`, `cancelled`, or `timed_out`.
- `task`: user-visible delegated task.
- `inputContract`: required context, file scope, tool scope, and expected output shape.
- `skills`: injected skills with scope, version, and reason.
- `tools`: available tools and tool restrictions.
- `artifacts`: final answer, changed files summary, test results, structured notes, or blocking errors.
- `startedAt`, `endedAt`, `durationMs`.
- `tokenUsage` and `costEstimate` when available.

### Skill Runtime Record

A skill runtime record explains the effective skill that the model sees.

Required fields:

- `name`: canonical skill name.
- `scope`: `builtin`, `user`, `project`, `remote`, or `session`.
- `sourcePath`: local path or remote cache identity.
- `version`: content hash or remote version.
- `status`: `active`, `shadowed`, `disabled`, `quarantined`, `invalid`, or `reloading`.
- `activation`: manual, mention, environment/profile, agent requirement, or dynamic recommendation.
- `supportFiles`: visible support files and size limits.
- `reload`: last reload timestamp, changed files, validation warnings, and errors.

### Trace Event

A trace event is an append-only record used by replay, evals, and optional sync.

Required fields:

- `schemaVersion`.
- `eventId`.
- `sessionId`.
- `runId`.
- `parentRunId`.
- `timestamp`.
- `type`.
- `payload`.
- `redactions`.

Required event families:

- `session.*`
- `agent.*`
- `skill.*`
- `tool.*`
- `permission.*`
- `model.*`
- `file.*`
- `env.*`
- `memory.*`
- `error.*`
- `eval.*`

## Phase 1: Shared Trace and Runtime Contracts

### Context

Subagents, skill reload, and replay need a common event model. Without this foundation, every feature will record slightly different data and replay will remain partial.

### Product Requirements

- Add a versioned local trace schema.
- Record all events as JSONL or equivalent append-only records under a local session directory.
- Assign one root run ID to the main chat session and child run IDs to subagents.
- Link replay entries to trace events.
- Redact secrets before writing trace records.
- Keep trace writing best-effort: a trace failure must not break the chat session.
- Add trace export with deterministic ordering.

### Subtasks

- Add trace event types for sessions, agents, skills, tools, permissions, model calls, environment/profile context, file edits, and errors.
- Add a trace writer service with append, flush, rotate, and export behavior.
- Extend replay session metadata with trace path and root run ID.
- Add sanitizer utilities shared with platform session tracking.
- Add trace retention config with a safe default.
- Add fixture-based schema tests for all required event families.

### Acceptance Criteria

- Starting a chat creates one root trace with a stable session ID and root run ID.
- A user message, assistant message, and tool call each produce linked trace records.
- Trace files are readable after a process crash up to the last flushed event.
- Secret-looking values are redacted from environment, command, and tool payloads.
- `/replay show current --timeline` can render events from the trace, not only chat entries.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/replay/**/*.spec.ts
node --test -r ts-node/register src/modules/platform/services/session-tracker.service.spec.ts
node --test -r ts-node/register src/modules/tools/**/*.spec.ts
npm run build
```

Manual CLI smoke:

```bash
npm run build
CAST_REPLAYS_DIR=/tmp/cast-runtime-v2-replays node dist/main.js
/context
/replay save trace-foundation-smoke
/replay show trace-foundation-smoke --timeline
/exit
```

Expected: replay output includes session metadata, root run ID, user/assistant entries, and trace path.

## Phase 2: Subagents v2

### Context

Cast has a useful native agent library, but runtime behavior needs stronger contracts. Agents should be inspectable work units with clear ownership, not just prompt snippets.

### Product Requirements

- Add an `AgentRunService` that owns subagent run creation, state transitions, cancellation, timeouts, and artifact capture.
- Add delegation contracts with task, file ownership, tool scope, skill requirements, output format, and acceptance criteria.
- Let the main agent dispatch one or more subagents and continue doing non-overlapping work.
- Record lifecycle events for queued, started, tool call, permission wait, completed, failed, cancelled, and timed out states.
- Show active and completed runs through `/agents runs` and `/agents show <run-id>`.
- Add run summaries to `/context` and replay.
- Prevent duplicate agents from editing the same file scope unless explicitly marked as shared.
- Support model and temperature overrides from agent definitions while keeping global policy limits.
- Make failed subagent outputs useful: include blocker, attempted steps, evidence, and recommended next action.

### Subtasks

- Extend agent types with runtime contract fields:
  - `ownership`
  - `defaultTools`
  - `requiredSkills`
  - `outputSchema`
  - `timeoutMs`
  - `maxTokens`
  - `handoffInstructions`
- Add `AgentRunService`.
- Add `AgentDelegationPlannerService` for deciding whether and how to split work.
- Add `AgentArtifactStore` for final outputs and structured handoffs.
- Update `/agents` commands:
  - `/agents runs`
  - `/agents show <run-id>`
  - `/agents cancel <run-id>`
  - `/agents inspect <name>`
- Update discovery tools so the model can list agents, inspect contracts, and dispatch with explicit ownership.
- Add conflict detection for overlapping file ownership.
- Emit trace events for every run transition.

### Acceptance Criteria

- A subagent run has a stable run ID visible to the user.
- `/agents runs` shows active, completed, failed, and cancelled runs.
- `/agents show <run-id>` shows task, status, selected skills, tools, artifacts, errors, token/cost summary, and trace link.
- A delegated coding task can assign disjoint file ownership to two agents.
- Overlapping file ownership is blocked or explicitly marked as shared before dispatch.
- Cancelling a running agent records `agent.cancelled` and prevents final artifacts from being treated as completed work.
- Failed agents produce a structured failure artifact rather than a generic error blob.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/agents/**/*.spec.ts
node --test -r ts-node/register src/modules/repl/services/commands/agent-commands.service.spec.ts
node --test -r ts-node/register src/modules/core/services/deep-agent.service.spec.ts
npm run build
```

Manual CLI smoke:

```bash
npm run build
CAST_REPLAYS_DIR=/tmp/cast-runtime-v2-replays node dist/main.js
/agents
/agents inspect api-engineer
Ask: delegate API route design to api-engineer and test planning to test-automation-engineer for a small health endpoint. Do not edit files.
/agents runs
/replay save subagents-v2-smoke
/replay show subagents-v2-smoke --agents --skills --tools
/exit
```

Expected: two subagent runs appear with separate run IDs, scoped tasks, selected skills, no file edits, and replay timeline entries.

## Phase 3: Skill Runtime v2, Scopes, and Hot Reload

### Context

Skills are now central to Cast behavior. The runtime needs clear precedence, live reload, validation, conflict reporting, and explainable activation.

### Product Requirements

- Define skill scopes and precedence:
  - `session` overrides `project`
  - `project` overrides `user`
  - `user` overrides `remote`
  - `remote` overrides `builtin`
- Show shadowing explicitly in `/skills inspect`.
- Add reload commands for one skill, all skills, and watch mode.
- Validate changed skills before activating them.
- Keep the last valid version active if a reload fails.
- Track content hash, support-file hash, metadata hash, and reload timestamp.
- Emit trace events for skill loaded, changed, reloaded, invalid, shadowed, injected, blocked, and removed.
- Recompute `$` suggestions after a successful reload.
- Recompute agent skill availability after a successful reload.
- Never execute scripts during reload. Reload only reads metadata, markdown, and support-file inventory.

### Subtasks

- Add `SkillScopeResolverService`.
- Add `SkillReloadService`.
- Add optional filesystem watcher for `.cast/skills/` and user skill directories.
- Add reload-safe validation for frontmatter, support paths, metadata policy, duplicate aliases, and size limits.
- Add skill version hashing.
- Add skill activation reason tracking.
- Update `/skills` commands:
  - `/skills reload [name|--all]`
  - `/skills watch [on|off|status]`
  - `/skills inspect <name> --effective`
  - `/skills conflicts`
- Update `$` suggestion ranking to include reload version and active scope.
- Update skill runtime tools to include scope and version in tool responses.

### Acceptance Criteria

- Editing `.cast/skills/example/SKILL.md` and running `/skills reload example` updates the effective skill without restarting Cast.
- If the edited skill is invalid, Cast reports validation errors and keeps the previous valid version active.
- `/skills inspect example --effective` shows active scope, source path, version hash, support files, aliases, risk/trust, activation policy, and shadowed definitions.
- `/skills conflicts` lists duplicate names and aliases across scopes.
- `$example` uses the latest valid reloaded content.
- Agents requiring a skill see the reloaded version after successful reload.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/skills/**/*.spec.ts
node --test -r ts-node/register src/modules/skills-import/**/*.spec.ts
node --test -r ts-node/register src/modules/repl/services/commands/repl-commands.service.spec.ts
npm run build
```

Manual CLI smoke:

```bash
npm run build
TMP_CAST_HOME=/tmp/cast-runtime-v2-home CAST_REPLAYS_DIR=/tmp/cast-runtime-v2-replays node dist/main.js
/skills create
/skills reload --all
/skills watch on
/skills inspect <created-skill> --effective
$<created-skill> summarize what this skill does
/replay save skill-runtime-v2-smoke
/replay show skill-runtime-v2-smoke --skills
/exit
```

Expected: the created or edited skill reloads without restart, appears in suggestions, and emits skill trace events.

## Phase 4: Observability and Replay v2

### Context

Replay should become the main debugging surface for agentic behavior. The user should not need to reconstruct what happened from scattered logs.

### Product Requirements

- Upgrade `/replay show` to render timeline, agents, skills, tools, permissions, errors, files, and summary sections.
- Add replay filtering by run ID, agent name, skill name, event type, and error-only mode.
- Add replay export as JSON and JSONL.
- Add a compact session summary:
  - goal
  - environment/profile
  - agents used
  - skills injected
  - tools called
  - files changed
  - tests run
  - errors
  - token/cost summary
  - final outcome
- Add trace integrity checks so corrupted replay files report a clear warning.
- Support redaction profiles:
  - `safe`: default, hides secrets and large tool outputs
  - `debug`: keeps more local detail but still redacts secrets
  - `minimal`: only metadata and event types
- Link replay entries to snapshots and git diff summaries when available.

### Subtasks

- Extend `ReplayService` to reference trace files and render trace-derived sections.
- Add replay query functions for event filtering.
- Add replay export command.
- Add trace integrity validator.
- Add redaction profiles and size limits.
- Add replay fixtures for sessions with subagents, skill reload, permission prompts, tool failures, and successful completion.
- Add golden evals that compare replay summaries against expected timelines.

### Acceptance Criteria

- `/replay show current --timeline` displays ordered events across root run and subagent runs.
- `/replay show <name> --agent <run-id>` shows only that agent's task, events, tools, skills, artifacts, and errors.
- `/replay show <name> --errors` shows failed tool calls, failed reloads, failed agents, and permission denials.
- `/replay export <name> --format jsonl` writes deterministic JSONL.
- Replay output never includes raw secret values from env vars, headers, tokens, or known credential patterns.
- A corrupted trace file produces a warning plus partial readable output when possible.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/replay/**/*.spec.ts
node --test -r ts-node/register src/modules/repl/services/commands/replay-commands.service.spec.ts
node --test -r ts-node/register src/modules/stats/**/*.spec.ts
npm run build
```

Manual CLI smoke:

```bash
npm run build
CAST_REPLAYS_DIR=/tmp/cast-runtime-v2-replays node dist/main.js
/context
/skills
/agents
Ask: explain the current project structure, then inspect available backend skills. Do not edit files.
/replay save observability-v2-smoke
/replay show observability-v2-smoke --timeline
/replay show observability-v2-smoke --skills
/replay export observability-v2-smoke --format jsonl
/exit
```

Expected: replay includes context, skill listing, agent/tool activity if any, and a deterministic export file.

## Phase 5: Integrated Agent-Skill-Trace E2E

### Context

The three epics only matter if they work together in real sessions. The release must prove that delegation, reload, and replay behave correctly through the CLI.

### Product Requirements

- Add at least one strict E2E smoke that starts Cast, interacts with chat, triggers skill usage, triggers subagent delegation, saves replay, and inspects the trace.
- Add evals for:
  - subagent selection
  - subagent no-delegation decision
  - skill reload and injection
  - skill conflict explanation
  - replay completeness
  - redaction
- Add benchmark hooks so runtime overhead is visible.
- Add release checklist docs for validating the feature locally.

### Subtasks

- Add `scripts/agentic-runtime-v2-smoke.mjs`.
- Add golden fixtures under `evals/fixtures/agentic-runtime-v2/`.
- Add trace schema fixtures and snapshot tests.
- Add documentation for commands and expected workflows.
- Add a release checklist to this PRD or a follow-up SDD.

### Acceptance Criteria

- A single E2E smoke proves that Cast can:
  - start in a temp project
  - load scoped skills
  - reload a changed project skill
  - delegate to at least one subagent
  - inspect agent run status
  - save replay
  - show replay timeline
  - export trace
- The smoke asserts observable outputs, not only exit code.
- Evals fail if required trace events are missing.
- Runtime overhead from tracing is measured and bounded.

### Terminal Tests

```bash
npm run typecheck
npm test
npm run build
node scripts/agentic-runtime-v2-smoke.mjs
npm pack --dry-run
```

Manual CLI smoke:

```bash
npm run build
CAST_REPLAYS_DIR=/tmp/cast-runtime-v2-replays node dist/main.js
/skills watch on
/skills reload --all
Ask: use the best backend skill and delegate a read-only implementation plan for a health endpoint to the right agent. Do not edit files.
/agents runs
/replay save agentic-runtime-v2-final
/replay show agentic-runtime-v2-final --timeline
/replay show agentic-runtime-v2-final --agents --skills --tools --errors
/exit
```

Expected: the CLI demonstrates all three epics together and leaves an inspectable replay artifact.

## Command UX Requirements

### `/agents`

- `/agents`: list available agents.
- `/agents inspect <name>`: show definition, skills, tools, model policy, environments, profiles, and output contract.
- `/agents runs`: show active and recent agent runs.
- `/agents show <run-id>`: show one run in detail.
- `/agents cancel <run-id>`: request cancellation and record the result.

### `/skills`

- `/skills`: list effective skills for the active context.
- `/skills inspect <name>`: show skill details.
- `/skills inspect <name> --effective`: show scope resolution and shadowing.
- `/skills reload <name>`: reload one skill.
- `/skills reload --all`: reload all skills.
- `/skills watch on|off|status`: manage hot reload watcher.
- `/skills conflicts`: show name and alias conflicts across scopes.

### `/replay`

- `/replay list`: list saved sessions.
- `/replay save <name>`: save current session.
- `/replay show <name>`: show summary.
- `/replay show <name> --timeline`: show ordered trace events.
- `/replay show <name> --agents`: show agent runs.
- `/replay show <name> --skills`: show skill decisions.
- `/replay show <name> --tools`: show tool calls.
- `/replay show <name> --errors`: show failures and denials.
- `/replay export <name> --format json|jsonl`: export trace data.

## Permissions, Privacy, and Safety

- Trace writing is local by default.
- Optional remote sync must reuse existing platform enablement and sanitization controls.
- Secrets must be redacted before persistence, not only before display.
- Tool outputs must be truncated by default with full local debug opt-in.
- Reload must never execute skill scripts.
- Agent dispatch must preserve permission prompts for shell, filesystem, network, MCP, and destructive actions.
- Replay export should warn when debug redaction profile may include sensitive local paths or command outputs.

## MVP Cut

The first shippable slice should include:

- Versioned trace events with local persistence.
- Agent run IDs, lifecycle states, `/agents runs`, and `/agents show`.
- Skill reload for project and user scopes, plus `/skills inspect --effective`.
- Replay timeline based on trace events.
- One E2E smoke that exercises all three areas.

Post-MVP:

- Rich visual replay UI.
- Remote trace aggregation.
- Advanced scheduling of background agents.
- Cross-session replay comparison.
- Automatic optimization recommendations from traces.

## Risks and Mitigations

- Trace volume grows too quickly. Mitigation: size limits, rotation, truncation, retention config, and compact summaries.
- Redaction misses a secret pattern. Mitigation: shared sanitizer, fixture tests, denylist patterns, and conservative default redaction.
- Agent delegation creates merge conflicts. Mitigation: explicit file ownership, conflict detection, and integration handoff artifacts.
- Hot reload introduces inconsistent runtime state. Mitigation: validate before activate and keep last valid version active.
- Users get overwhelmed by new commands. Mitigation: make `/agents`, `/skills`, and `/replay` default views compact with detail behind flags.
- E2E tests become flaky because model output varies. Mitigation: assert structural CLI outputs and trace events, not exact prose.

## Open Questions

- Should trace storage live under the replay directory, state directory, or a new trace-specific directory?
- Should `/trace` exist as a separate command, or should all user-facing trace inspection stay under `/replay`?
- Should agent run artifacts be persisted forever with replay, or follow a shorter retention policy?
- Should skill watch mode be opt-in per session or persisted per project?
- What is the maximum acceptable tracing overhead for a normal chat session?

## Release Checklist

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- New replay, agent, skill, and trace unit tests pass.
- New E2E smoke passes against a temp project.
- Redaction fixtures prove secrets are not persisted.
- Manual CLI smoke verifies real chat interaction, skill reload, subagent run inspection, replay timeline, and export.
- Documentation avoids historical package labels and presents the feature as one Cast runtime.
