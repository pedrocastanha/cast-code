# Trace Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/trace`.

## Purpose

The trace module owns structured local trace context, event writing, redaction, reading, and export.

## Key Files

- `trace.module.ts`: provides and exports context, writer, reader, sanitizer, and export services.
- `services/trace-context.service.ts`: starts sessions, creates child run IDs, and allocates event IDs.
- `services/trace-writer.service.ts`: buffers/writes trace events and exposes current trace references.
- `services/trace-sanitizer.service.ts`: redacts sensitive values from event payloads.
- `services/trace-reader.service.ts`: reads trace files into events.
- `services/trace-export.service.ts`: exports traces as JSON or JSONL.
- `types/trace.types.ts`: trace schema, event, context, redaction, and replay reference contracts.

## Boundaries

- Replay consumes trace references and exports but owns replay sessions.
- Platform session telemetry is separate and must also sanitize payloads.
- Agent delegated run tracking uses trace through `agents`.

## Decisions To Preserve

- Trace schema version is currently `1`.
- Trace files should remain local diagnostic artifacts.
- Sanitize secrets before writing/exporting trace events.
- Child run IDs should preserve parent/label relationships for delegated work.

## Tests

`src/modules/trace/services/trace-writer.service.spec.ts` covers writer behavior. Add sanitizer/export tests when changing redaction or formats.

Update this file when trace schema, event types, redaction logic, trace file layout, or export format changes.
