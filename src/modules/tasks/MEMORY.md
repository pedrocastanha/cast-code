# Tasks Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/tasks`.

## Purpose

The tasks module owns in-session task planning and execution primitives: task lists, plan approval, plan persistence, plan execution, and tools for agents to create/update/list tasks or ask the user questions.

## Key Files

- `tasks.module.ts`: imports `PermissionsModule` and `CoreModule`; exports task, plan-mode, and task-tool services.
- `services/task-management.service.ts`: creates/updates/lists tasks, creates plans, manages approval, and tracks execution context.
- `services/plan-mode.service.ts`: enters/exits plan mode, captures plan context, and handles approval results.
- `services/plan-executor.service.ts`: executes approved plans through core task execution.
- `services/plan-persistence.service.ts`: saves markdown plans and progress/completion state.
- `services/task-tools.service.ts`: exposes task management and user-question tools to agents.
- `types/task.types.ts`: task, plan, approval, and execution contracts.

## Boundaries

- Core owns actual model/tool execution for task steps.
- Permission prompts are provided by `permissions`.
- Kanban renders tasks but does not own task state.

## Decisions To Preserve

- Plan execution should require approval unless explicitly auto-approved by the user flow.
- Task tools must not silently bypass permission/user-question gates.
- Persisted plans are execution records, not source-of-truth product specs.
- Execution context must be clearable after a plan completes or is canceled.

## Tests

There are no direct specs at the time of writing. Add tests before changing plan approval, task tool schemas, or execution lifecycle.

Update this file when task state shape, plan approval semantics, task tools, persisted plan format, or execution context behavior changes.
