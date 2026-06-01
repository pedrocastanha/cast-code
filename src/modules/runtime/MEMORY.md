# Runtime Module Memory

Updated: 2026-05-21

Read the root `MEMORY.md` first. This file captures module-local decisions for
`src/modules/runtime`.

## Purpose

The runtime module owns Cast's typed local runtime event contract and sanitized
projection helpers. It is the boundary between provider/model execution and
consumers such as the REPL renderer, local traces/replay, and platform session
telemetry.

## Key Files

- `types/runtime-event.types.ts`: `CastRuntimeEvent`, scopes, lifecycle events,
  message events, tool events, subagent events, swarm events, verification
  events, and usage events. `runtime.tool.started` may include local-only tool
  input for runtime consumers.
- `services/runtime-telemetry-projector.service.ts`: converts local runtime
  events to sanitized `PlatformEvent` metadata. It intentionally drops raw
  message text events and strips raw output previews.
- `runtime.module.ts`: exports runtime services for modules such as REPL.

## Decisions To Preserve

- Local runtime events may include local-only raw text, but platform projection
  must be sanitized and lossy.
- `runtime.message.delta` and `runtime.message.completed` are not projected to
  platform by default because they contain assistant output.
- Tool telemetry can include tool name, scope, status, duration, and summary,
  but not raw tool output.
- Tool input on `runtime.tool.started` is local-only. Do not project it to
  platform session telemetry unless a future policy explicitly allows a
  redacted subset.
- Keep the Cast-owned event protocol stable even if LangChain/DeepAgents raw
  event shapes change.

## Tests

`services/runtime-telemetry-projector.service.spec.ts` verifies that raw
assistant text is dropped and bridge tool completion projects only sanitized
metadata.

Update this file when runtime event names, event payload fields, projection
rules, or telemetry privacy policy changes.
