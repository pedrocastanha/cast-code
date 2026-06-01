# Replay Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/replay`.

## Purpose

The replay module records lightweight local session timelines and connects saved replays to trace files for later inspection/export.

## Key Files

- `replay.module.ts`: imports `TraceModule`; provides and exports `ReplayService`.
- `services/replay.service.ts`: records entries, auto-saves sessions, saves named snapshots, lists sessions, builds timelines, and exports trace files as JSON/JSONL.

## Boundaries

- Structured event writing/sanitization belongs to `trace`.
- Local SQLite session history belongs to `state`.
- REPL command rendering for replay lives in `repl/services/commands/replay-commands.service.ts`.

## Decisions To Preserve

- Replay should remain local by default.
- Keep replay entries lightweight enough for terminal display.
- Trace export must use `TraceExportService` rather than reimplementing trace parsing.
- Snapshot names should be normalized into safe file names.

## Tests

`src/modules/replay/services/replay.service.spec.ts` covers replay behavior.

Update this file when replay file layout, timeline shape, auto-save behavior, or trace export integration changes.
