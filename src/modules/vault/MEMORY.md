# Vault Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/vault`.

## Purpose

The vault module owns local reusable snippets and promotion of snippets into skill files.

## Key Files

- `vault.module.ts`: provides and exports `VaultService`.
- `services/vault.service.ts`: saves/list/reads/deletes snippets, parses frontmatter, writes snippet markdown, and promotes snippets to a skills directory.

## Boundaries

- Slash command UI lives in `repl/services/commands/vault-commands.service.ts`.
- Runtime skill loading belongs to `skills`; vault only writes candidate skill files.

## Decisions To Preserve

- Snippets are local user artifacts.
- Promotion to skill should create a readable markdown skill artifact rather than mutating the runtime registry directly.
- Snippet names must resolve to safe local paths.

## Tests

There are no direct specs at the time of writing. Add tests if snippet file format, path handling, or skill promotion changes.

Update this file when vault storage layout, snippet frontmatter, promotion format, or delete/list behavior changes.
