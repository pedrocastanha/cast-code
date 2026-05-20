# Watcher Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/watcher`.

## Purpose

The watcher module emits debounced local file-change events so runtime context can react to source edits.

## Key Files

- `watcher.module.ts`: provides and exports `FileWatcherService`.
- `services/file-watcher.service.ts`: starts/stops watch mode on app bootstrap/shutdown, prefers `chokidar` if installed, falls back to `fs.watch`, debounces changes, and emits `FILE_CHANGE_EVENT`.

## Boundaries

- Consumers decide how to invalidate caches or refresh prompts after a file-change event.
- This module should not perform project analysis, prompt rebuilds, or filesystem writes.

## Decisions To Preserve

- Watch `src` when it exists; otherwise fall back to `process.cwd()`.
- Ignore generated/vendor/internal paths such as `node_modules`, `.git`, `dist`, `.superpowers`, and `.snap`.
- File watching is best-effort; startup should not fail if watching cannot start.
- Debounce change batches before emitting events.

## Tests

There are no direct specs at the time of writing. Add tests if file-change event semantics, ignored path policy, or auto-watch lifecycle changes.

Update this file when watch paths, ignored patterns, event names, debounce behavior, or lifecycle hooks change.
