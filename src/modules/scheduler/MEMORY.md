# Scheduler Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/scheduler`.

## Purpose

The scheduler module owns recurring task/benchmark definitions, cron parsing, policy checks, manual/due execution, local state persistence, platform sync, suggestions, and worker installation.

## Key Files

- `scheduler.module.ts`: imports state, platform, benchmark, sandbox, environment, and config modules; exports scheduler services and commands.
- `commands/schedule-commands.service.ts`: `/schedule` create/list/run/logs/sync/worker command UI.
- `services/schedule-cron.service.ts`: validates cron expressions and computes next run times.
- `services/schedule-store.service.ts`: persists schedule definitions/runs in local state.
- `services/schedule-policy.service.ts`: enforces budgets and mutation/write approval policy.
- `services/schedule-runner.service.ts`: runs schedules and delegates benchmark/environment/agent/shell targets.
- `services/schedule-platform-sync.service.ts`: syncs schedule definitions and runs to platform.
- `services/schedule-suggestion.service.ts`: maps environments to suggested schedules.
- `services/schedule-worker.service.ts`: installs/status/uninstalls a local systemd worker where supported.
- `types/scheduler.types.ts`: schedule target/status/policy/run contracts.

## Boundaries

- Benchmark execution belongs to `benchmark`; scheduler builds or invokes definitions.
- Sandbox execution belongs to `sandbox`; scheduler chooses policy/config.
- Platform HTTP belongs to `platform`; scheduler maps payloads and handles sync results.

## Decisions To Preserve

- Target types include benchmark, environment_task, agent_prompt, rag_refresh, and shell_command.
- Scheduled sync must not send raw prompt/input content unnecessarily.
- Mutation/write-enabled schedules require policy assessment and approval.
- Worker support is currently Linux/systemd or unsupported; do not pretend cross-platform worker support exists.

## Tests

Specs cover commands, cron, platform sync, policy, runner, store, and worker under `src/modules/scheduler`.

Update this file when target types, cron semantics, policy gates, platform sync payloads, worker behavior, or environment suggestions change.
