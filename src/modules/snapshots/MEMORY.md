# Snapshots Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/snapshots`.

## Purpose

The snapshots module owns file and project checkpoint snapshots for rollback support.

## Key Files

- `snapshot.module.ts`: provides and exports `SnapshotService`.
- `services/snapshot.service.ts`: saves single-file snapshots, saves project checkpoints, rolls back files/checkpoints, tracks metadata/manifests, prunes old snapshots, and ignores build/vendor directories.

## Boundaries

- Sandbox snapshot mode consumes this module but does not own snapshot metadata.
- REPL rollback command UI lives in `repl/services/commands/snapshot-commands.service.ts`.
- Git history is separate; snapshots are local safety nets, not commits.

## Decisions To Preserve

- Ignore generated/vendor directories such as `node_modules`, `.git`, `dist`, `.superpowers`, and snapshot internals.
- Preserve executable bits when restoring snapshot files where possible.
- Checkpoint rollback must remove files created after the checkpoint when they were not part of the original manifest.
- Keep snapshot metadata local.

## Tests

`src/modules/snapshots/services/snapshot.service.spec.ts` covers snapshot behavior.

Update this file when snapshot directory layout, ignored file policy, checkpoint manifest shape, or rollback semantics change.
