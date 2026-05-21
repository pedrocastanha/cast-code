# Platform Module Memory

Updated: 2026-05-21

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/platform`.

## Purpose

The platform module owns CLI integration with Cast Platform: project linking, global/project config resolution, authentication, project payload loading, remote skill/agent/MCP adaptation, cache/offline behavior, RAG/memory calls, benchmark/schedule API calls, and sanitized session telemetry.

## Key Files

- `platform.module.ts`: imports skills, agents, and MCP modules; exports platform config/client/cache/service/session/adapters/linking.
- `services/platform-config.service.ts`: reads `.cast/cast.yaml`, global `~/.cast/config.yaml`, API URL, project id, key env, active environment, and project link writes.
- `services/cast-link.service.ts`: writes platform project links from command options.
- `services/platform-client.service.ts`: HTTP client for auth, projects, sessions, memory, benchmarks, and schedules.
- `services/platform.service.ts`: bootstraps platform state, applies project payloads, exposes memory retrieval/overview/usage, and session event tracking.
- `services/platform-cache.service.ts`: caches project payloads and pending events for offline operation.
- `services/remote-definition-adapter.service.ts`: converts platform skill/agent/MCP payloads into local runtime definitions/configs.
- `services/session-tracker.service.ts`: opens/closes sessions and sends sanitized metadata/events.
- `types/platform.types.ts`: platform config, project payload, memory, benchmark, schedule, and event contracts.

## Boundaries

- `/platform` command UI lives in `repl/services/commands/platform-commands.service.ts`.
- Backend endpoint implementation lives in the sibling `backend` package.
- Web UI snippets live in the sibling `web` package.

## Decisions To Preserve

- `/platform` and `cast platform ...` are the supported setup flows. Do not advertise `/link` or `cast link`.
- Project `.cast/cast.yaml` must store binding metadata only: project id, API URL, and `apiKeyEnv`.
- Real API keys belong in `CAST_API_KEY` or global `~/.cast/config.yaml`, not in project manifests.
- Reject `apiKeyEnv` values that look like actual API keys.
- Offline platform state should use usable cache when available and report `offline`, not `disabled`.
- Session telemetry must be sanitized and must not sync raw conversation content by default.
- Project payload types now include optional runtime, swarm, model, sandbox,
  and telemetry policy fields. They are optional for backward compatibility
  with older backend payloads.
- `PlatformEventType` includes sanitized runtime/swarm event names. Runtime
  message text is not tracked directly; use `RuntimeTelemetryProjectorService`
  to project local runtime events before calling `PlatformService.track`.

## Tests

Specs cover link, cache, client, config, bootstrap/service, remote adapter, and session tracker under `src/modules/platform/services`.

Update this file when platform config schema, API endpoints, project payload shape, key handling, cache semantics, RAG behavior, or session telemetry changes.
