# Sandbox Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/sandbox`.

## Purpose

The sandbox module owns isolated execution and rollback support for benchmarks, schedules, and other controlled runs.

## Key Files

- `sandbox.module.ts`: imports `SnapshotModule` and `StateModule`; provides command, manager, backend, command-runner, and artifact services.
- `commands/sandbox-commands.service.ts`: `/sandbox` command help/status/list behavior.
- `services/sandbox-manager.service.ts`: selects backends, wraps execution, captures results, handles rollback.
- `services/docker-sandbox.service.ts`: Docker backend with controlled command execution and environment allowlist.
- `services/git-worktree-sandbox.service.ts`: git worktree backend.
- `services/snapshot-sandbox.service.ts`: snapshot/checkpoint backend with rollback.
- `services/noop-sandbox.service.ts`: fallback backend when isolation is disabled.
- `services/sandbox-command-runner.service.ts`: subprocess runner used by backends.
- `services/sandbox-artifact.service.ts`: writes redacted sandbox artifacts.
- `types/sandbox.types.ts`: backend, context, config, result, and artifact contracts.

## Boundaries

- Benchmark/scheduler decide when sandboxing is required; sandbox performs isolation.
- Permission prompts and command approval live in `permissions`.
- Snapshot persistence lives in `snapshots`; this module consumes it.

## Decisions To Preserve

- Docker should default to no network unless explicitly allowed.
- Prefer real isolation when write-enabled or risky benchmark/schedule runs need it.
- Always capture diffs/status/artifacts where possible so failed runs can be inspected.
- Rollback behavior must be explicit and conservative.

## Tests

Specs cover command service, Docker, git worktree, and manager behavior under `src/modules/sandbox`.

Update this file when sandbox mode selection, Docker args, rollback semantics, artifact redaction, or backend contracts change.
