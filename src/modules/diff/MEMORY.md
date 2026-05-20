# Diff Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/diff`.

## Purpose

The diff module is a small display utility for generating and colorizing file/edit diffs.

## Key Files

- `diff.module.ts`: provides and exports `DiffService`.
- `services/diff.service.ts`: creates unified patches for whole-file changes or string edits and formats them for terminal display.

## Boundaries

- This module does not read or write files. Callers pass original/new content.
- Permission checks, snapshots, and write guards belong to `permissions`, `snapshots`, and `tools`.

## Decisions To Preserve

- Keep this module pure and side-effect-light.
- Preserve terminal-friendly formatting for insertions/deletions.
- Do not mix file mutation logic into `DiffService`.

## Tests

There are no direct specs at the time of writing. Add focused tests if diff formatting or patch semantics become user-visible in new flows.

Update this file when diff output, color handling, or edit-diff semantics change.
