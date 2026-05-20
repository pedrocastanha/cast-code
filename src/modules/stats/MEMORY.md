# Stats Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/stats`.

## Purpose

The stats module tracks token usage, cached-input tokens, output tokens, cost estimates, session stats, daily/all-time summaries, and footer cost indicators.

## Key Files

- `stats.module.ts`: provides and exports `StatsService`.
- `services/stats.service.ts`: normalizes model names, calculates estimated cost, persists session/day/all-time stats, exposes usage listener hooks, and formats session indicators.

## Boundaries

- Core extracts usage from model outputs and calls this service.
- REPL displays stats through footer and `/stats`; command rendering lives in `repl`.
- Billing truth lives with providers/platform; this module is local estimation.

## Decisions To Preserve

- Cost estimates must be labeled/treated as estimates.
- Keep cached input tokens tracked separately from billable input tokens where providers expose them.
- Persist stats locally and avoid sending detailed usage externally unless a sanitized platform event explicitly needs it.

## Tests

There are no direct specs at the time of writing. Add tests when pricing tables, persistence format, or footer semantics change.

Update this file when token accounting, model normalization, price tables, stats persistence, or usage listener behavior changes.
