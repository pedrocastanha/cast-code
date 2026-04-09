# Snapshots Module

## Overview
File snapshot and rollback system — creates copy-on-write backups before agent writes, enabling safe undo of agent-made changes.

## Role in System
Before any agent writes to a file, the Snapshot module creates a backup copy. This enables the `/rollback` command to revert files to their pre-agent state. Provides a safety net for AI-generated code changes.

## Dependencies
- **Depends on**: None (self-contained, file-based)
- **Used by**: CoreModule (DeepAgentService calls before writes), REPL (SnapshotCommandsService)
- **External deps**: File system operations

## Key Services/Providers
| Service | Purpose |
|---|---|
| `SnapshotService` | Creates copy-on-write snapshots before file modifications. Manages snapshot storage, rollback operations, and snapshot history. |

## Key Types/Interfaces
No dedicated types file. Snapshots likely stored with file path, timestamp, and content metadata.

## Coding Standards & Patterns
- **Copy-on-write**: Snapshots are created lazily — only when a file is about to be modified. Unchanged files have no snapshots.
- **Pre-write hook**: DeepAgentService calls the snapshot service before writing files. The snapshot is taken from the current file content.
- **Rollback support**: Restores files from their most recent snapshot. Can rollback individual files or all files in a session.
- **Session-scoped**: Snapshots are likely organized by session or turn, allowing granular rollback.

## Business Rules
- Snapshots are created automatically before agent writes — users don't need to enable them.
- Rollback restores files to their state before the agent started writing in the current session.
- Multiple writes to the same file may only snapshot the first change (copy-on-write).
- Snapshot storage has a cleanup mechanism to prevent disk space exhaustion.

## Circular Dependencies
None.

## Working on This Module
- **Single service**: Everything is in `snapshot.service.ts`. Simple, focused module.
- **Integration point**: DeepAgentService in Core calls `snapshotService.snapshot(filePath)` before writing.
- **Rollback commands**: REPL's `SnapshotCommandsService` provides `/snapshot` and `/rollback` commands.
- **Storage location**: Snapshots are likely stored in `.cast/snapshots/` or a temp directory. Check the service for exact path.
- **Performance impact**: Copy-on-write adds minimal overhead (one file copy per modified file). For large files, consider the I/O cost.
