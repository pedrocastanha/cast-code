# Kanban Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/kanban`.

## Purpose

The kanban module serves the local task board UI used by `/kanban`. It exposes task state over a small local HTTP/SSE server.

## Key Files

- `kanban.module.ts`: imports `TasksModule` and `RemoteModule`; provides and exports `KanbanServerService`.
- `services/kanban-server.service.ts`: starts/stops the local server, serves board state, handles SSE, and broadcasts updates.
- `views/kanban-ui.ts`: browser UI asset served by the local server.

## Boundaries

- Task creation/update logic belongs to `tasks`; kanban renders and transports it.
- Remote/mobile prompt access belongs to `remote`, not kanban.

## Decisions To Preserve

- Keep kanban local-first; do not make it a platform sync channel without an explicit product decision.
- SSE should broadcast board changes without blocking task execution.
- Browser opening should remain an option, not a hard requirement for server startup.

## Tests

`src/modules/kanban/views/kanban-ui.spec.ts` covers view behavior.

Update this file when board state shape, SSE event names, local server behavior, or task integration changes.
