# State Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/state`.

## Purpose

The state module owns local SQLite state: database lifecycle, migrations, session/message/tool-call persistence, FTS search, and redaction helpers.

## Key Files

- `state.module.ts`: provides and exports `StateDbService`, `StateMigrationService`, `LocalSessionStoreService`, and `StateRedactionService`.
- `services/state-db.service.ts`: opens local SQLite DB, applies migrations, handles transient busy errors, and closes on shutdown.
- `services/state-migration.service.ts`: owns schema migrations for local state, benchmark tables, schedule tables, and FTS structures.
- `services/local-session-store.service.ts`: records sessions, messages, tool calls, summaries, and search results.
- `services/state-redaction.service.ts`: redacts secrets, creates content previews, and hashes raw content.
- `types/state.types.ts`: local session/message/tool/search/config contracts.

## Boundaries

- Replay timeline files live in `replay`.
- Platform session telemetry lives in `platform`; it should consume sanitized summaries/events.
- Memory search may use state/FTS but local memory semantics live in `memory`.

## Decisions To Preserve

- Local state may store redacted summaries/previews, not raw secrets.
- Platform sync should not use raw local conversation content by default.
- Tests must isolate DB paths and never touch a developer's real local state.
- Migrations must be additive and idempotent for existing user databases.

## Tests

Specs cover module wiring, DB lifecycle, local session store, and redaction under `src/modules/state`.

Update this file when schema migrations, local state file path, redaction rules, FTS search, or session persistence changes.
