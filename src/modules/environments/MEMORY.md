# Environments Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/environments`.

## Purpose

The environments module owns domain environment packs, active environment state, readiness checks, default benchmark seeds, and `/env` command behavior.

## Key Files

- `environment.module.ts`: imports agents, skills, MCP, platform, benchmark, scheduler, and config services.
- `commands/environment-commands.service.ts`: implements environment listing, activation, inspection, and help.
- `services/environment-loader.service.ts`: loads built-in and project environment manifests.
- `services/environment-activation.service.ts`: persists active environment/profile and seeds default benchmarks.
- `services/environment-readiness.service.ts`: checks required agents, skills, MCPs, RAG, and benchmarks.
- `services/environment-resolver.service.ts`: resolves active environment/profile and builds environment prompt context.
- `services/environment-default-benchmarks.ts`: smoke benchmark templates associated with environments.
- `types/environment.types.ts`: zod schemas and runtime contracts.

## Boundaries

- Skills, agents, and MCP registries own their own definitions; this module only scopes and recommends them.
- Platform project payloads may define active environment metadata, but platform HTTP belongs to `platform`.
- Benchmark execution belongs to `benchmark`; this module may seed definitions.

## Decisions To Preserve

- Built-in environments currently include engineering, marketing, and design.
- Environments should scope agents, skills, and MCP summaries without permanently deleting unscoped definitions.
- Readiness should distinguish ready, warning, and blocked states.
- Activation writes project environment/profile metadata through `PlatformConfigService`.
- Environment prompts should be concise and based on the active profile.

## Tests

Primary specs live under `src/modules/environments/**/*.spec.ts`.

Update this file when environment manifests, activation storage, readiness checks, default benchmarks, or active-scope behavior changes.
