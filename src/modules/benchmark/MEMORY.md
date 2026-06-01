# Benchmark Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/benchmark`.

## Purpose

The benchmark module owns the CLI-side Benchmark Lab: target discovery, quick definitions, graders, run execution, sandbox use, artifacts, local storage, and platform sync.

## Key Files

- `benchmark.module.ts`: imports `CommonModule`, `StateModule`, `PlatformModule`, and `SandboxModule`; exports all benchmark services.
- `commands/benchmark-commands.service.ts`: slash-command UI for benchmark flows.
- `services/benchmark-definition.service.ts`: builds and validates benchmark definitions.
- `services/benchmark-explicit-target.service.ts`: resolves user-specified files/routes before broad discovery.
- `services/benchmark-route-discovery.service.ts`: scans Express, NestJS, Next.js route handlers, and OpenAPI files.
- `services/benchmark-harness-planner.service.ts`: decides direct HTTP vs wrapper vs controlled environment.
- `services/benchmark-model-locator.service.ts`: finds model override points.
- `services/benchmark-runner.service.ts` and `benchmark-target.service.ts`: execute benchmark definitions and target types.
- `services/benchmark-grader.service.ts`: deterministic and budget-gated grading.
- `services/benchmark-platform-sync.service.ts`: syncs definitions, runs, results, and artifacts to Cast Platform.
- `services/benchmark-store.service.ts` and `benchmark-artifact.service.ts`: local persistence and redacted reports.

## Boundaries

- Sandbox creation belongs to `sandbox`; benchmark chooses modes and consumes sandbox results.
- Platform HTTP details belong to `platform`; this module maps benchmark data into platform payloads.
- Scheduled benchmark execution belongs to `scheduler`, which delegates benchmark execution here.

## Decisions To Preserve

- If the user provides an explicit target via mention/path/route, skip broad project discovery.
- Ask for confirmation before writing wrappers or modifying project files for benchmark harnesses.
- Prefer controlled/sandboxed environments when benchmark setup requires code writes.
- Store and sync references, summaries, hashes, and redacted artifacts rather than raw secrets or unnecessary raw content.
- Keep graders deterministic by default; LLM judging must remain budget-gated.

## Tests

Specs cover commands, artifact writing, target resolution, graders, route discovery, runner, sandbox decisions, store behavior, and platform sync under `src/modules/benchmark/**/*.spec.ts`.

Update this file when benchmark target types, sync payloads, sandbox policy, discovery behavior, or grading semantics change.
