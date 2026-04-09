# Kanban Module

## Overview
HTTP server with SSE-based Kanban board UI, integrating with the task management system for visual task tracking.

## Role in System
Provides a web-based Kanban board that displays tasks from the Tasks module. Runs as an HTTP server with Server-Sent Events (SSE) for real-time updates. Can be exposed remotely via the Remote module (ngrok). Used when the user wants a visual, browser-based task view.

## Dependencies
- **Depends on**: TasksModule (for task data), RemoteModule (for optional remote exposure)
- **Used by**: REPL (via KanbanServerService direct calls), browser users
- **External deps**: Node.js `http` module, SSE implementation

## Key Services/Providers
| Service | Purpose |
|---|---|
| `KanbanServerService` | HTTP server that serves the Kanban board UI. Supports SSE for real-time task updates. Renders HTML view from `views/kanban-ui.ts`. |

## Key Types/Interfaces
No dedicated types file — types are inferred from Tasks module.

## Coding Standards & Patterns
- **HTTP server pattern**: Uses Node.js built-in `http` module (not Express/NestJS HTTP adapter) for a lightweight standalone server.
- **SSE for real-time**: Server-Sent Events push task updates to connected clients without polling.
- **UI rendering**: The Kanban UI is generated from TypeScript in `views/kanban-ui.ts` — likely a function that returns HTML string.
- **Task integration**: Reads task state from TasksModule — plan steps, their status (pending, in_progress, completed), and dependencies.
- **Optional remote exposure**: Integrates with RemoteModule for ngrok tunneling when remote access is needed.

## Business Rules
- The Kanban board reflects the current state of the Tasks module — it doesn't manage tasks independently.
- SSE connections receive updates when task status changes.
- The server runs on a configurable port (check config for port assignment).

## Circular Dependencies
None.

## Working on This Module
- **Single service**: Everything is in `kanban-server.service.ts`. The HTTP server, SSE handling, and task integration are co-located.
- **UI is code-generated**: `views/kanban-ui.ts` generates HTML — it's not a template engine. Modify this file to change the board appearance.
- **Starting the server**: The service likely exposes a `start()` method. Check REPL's Kanban commands for how it's triggered.
- **Port conflicts**: If the Kanban server fails to start, check for port conflicts with the Remote module or other HTTP servers.
