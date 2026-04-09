# Tasks Module

## Overview
Task and plan management — handles execution, approval flow, plan persistence, and plan-to-action conversion.

## Role in System
Manages the structured plan lifecycle. When PlanModeService generates a plan, the Tasks module takes over — presenting the plan to the user, getting approval, persisting it, and executing steps sequentially. Integrates with the permission system for step-level approval.

## Dependencies
- **Depends on**: PermissionsModule, CoreModule (forwardRef — for PlanModeService and DeepAgentService)
- **Used by**: REPL, Kanban (reads task state), CoreModule
- **External deps**: None

## Key Services/Providers
| Service | Purpose |
|---|---|
| `TaskManagementService` | Central task orchestration — creates tasks from plans, manages task lifecycle (pending → in_progress → completed/failed), handles approval flow. |
| `PlanModeService` | Note: Also exists in CoreModule. This may be a duplicate or a tasks-specific variant that coordinates with Core's PlanModeService. |
| `PlanPersistenceService` | Saves and loads plans to/from disk. Plans persist across sessions for resumption. |
| `PlanExecutorService` | Executes plan steps sequentially. Sends each step to DeepAgentService for execution, tracks progress, handles failures. |
| `TaskToolsService` | Wraps task operations as LangChain StructuredTools so agents can create, update, and check tasks programmatically. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `Task` | Task representation: id, plan reference, status, steps, createdAt, updatedAt |
| `Plan` | (shared with Core) title, overview, steps[], complexity, shouldPlan |
| `PlanStep` | (shared with Core) id, description, files[], estimatedTime?, dependencies?[] |

## Coding Standards & Patterns
- **Plan lifecycle**: Plan generated (Core) → presented to user → approved → persisted → executed step by step → completed.
- **Step-by-step execution**: `PlanExecutorService` sends one step at a time to DeepAgentService, waits for completion, then moves to the next.
- **Approval flow**: Each step (or the plan as a whole) can require user approval before execution, gated by the Permissions module.
- **Persistence**: Plans are saved to disk (likely JSON in `.cast/plans/`) and can be resumed across sessions.
- **Status tracking**: Tasks transition through states: `pending` → `in_progress` → `completed` or `failed`.

## Business Rules
- Plans must be approved by the user before execution begins.
- Steps execute sequentially — no parallel step execution.
- Failed steps can be retried or the plan can be aborted.
- Persisted plans survive session restarts.
- Task tools allow agents to check task progress and update step status.

## Circular Dependencies
- `TasksModule` → `forwardRef(CoreModule)` — tasks need Core for plan execution; Core may reference Tasks for task-related operations.

## Working on This Module
- **PlanModeService duplication**: Note that `PlanModeService` exists in both Core and Tasks modules. The Tasks version likely focuses on plan presentation and approval, while the Core version focuses on plan generation. Check both to understand the split.
- **Execution flow**: `TaskManagementService.createTask(plan)` → `PlanExecutorService.execute(task)` → step-by-step via DeepAgentService → status updates.
- **Kanban integration**: Kanban module reads task state from here to display the board.
- **Persistence format**: Plans are likely saved as JSON with the plan structure plus metadata (creation time, approval status, execution progress).
- **Testing**: Test plan creation, approval, execution, and rollback. Verify persistence by restarting and checking if plans resume correctly.
