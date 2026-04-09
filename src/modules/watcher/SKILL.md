# Watcher Module

## Overview
File change detection — monitors the project directory for file system changes and broadcasts events to interested parties.

## Role in System
Watches the project directory for file changes (create, modify, delete) and emits events that other modules can subscribe to. Used by Core (DeepAgentService) to trigger context refreshes when files change, ensuring the agent's understanding of the project stays current.

## Dependencies
- **Depends on**: None (self-contained, uses Node.js fs watchers)
- **Used by**: CoreModule (DeepAgentService subscribes to FILE_CHANGE_EVENT)
- **External deps**: Node.js `fs` module (watcher APIs)

## Key Services/Providers
| Service | Purpose |
|---|---|
| `FileWatcherService` | Sets up filesystem watchers on the project directory. Emits `FILE_CHANGE_EVENT` events when files are created, modified, or deleted. Extends Node.js `EventEmitter`. |

## Key Types/Interfaces
No dedicated types file. Events emit with file paths and change type.

## Coding Standards & Patterns
- **EventEmitter**: The service extends EventEmitter and exports a constant `FILE_CHANGE_EVENT` string for subscription.
- **FS watchers**: Uses Node.js `fs.watch()` or `fs.watchFile()` for file monitoring.
- **Debouncing**: Likely debounces rapid file changes (editors often trigger multiple events per save).
- **Selective watching**: May ignore certain directories (`node_modules`, `.git`, `dist`) to reduce noise.

## Business Rules
- Changes to files trigger events that cause context refreshes in DeepAgentService.
- Build artifacts (`dist/`, `build/`) and dependency directories (`node_modules/`) are typically excluded.
- Multiple rapid changes are debounced to avoid excessive context rebuilds.

## Circular Dependencies
None.

## Working on This Module
- **Single service**: Everything is in `file-watcher.service.ts`. Very focused module.
- **Subscription pattern**: Other modules subscribe via `fileWatcherService.on(FILE_CHANGE_EVENT, callback)`.
- **Debouncing**: If context refreshes fire too frequently, check the debounce timing in the watcher.
- **Exclusions**: If certain directories should be ignored, add them to the watch exclusion list.
- **Testing**: Create and modify files in a test directory to verify event emission. Check debounce behavior with rapid changes.
