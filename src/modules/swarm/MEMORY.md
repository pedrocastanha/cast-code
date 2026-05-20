# Swarm Module

Agent Swarm orchestrates approved multi-agent implementation plans with isolated
workers, worktrees, and safe patch integration.

## Phase 1

- Types and validation for SwarmPlan / SwarmRun contracts
- SQLite persistence (`swarm_plans`, `swarm_runs`, `swarm_task_runs`)
- `/swarm plan|status|show|approve|cancel` REPL commands
- Heuristic planner with skill/agent assignment
- Bridge runtime policy detection
- `ReplService` calls `SwarmCommandsService.offerForPrompt` before normal or bridge prompt routing
- Trace events for plan create/approve

## Phase 2

- `SwarmWorktreeService` — git worktrees under `.cast/worktrees/<run-id>/<task-id>`
- `SwarmIsolatedAgentService` — per-worker `createDeepAgent` (serialized tool roots)
- `SwarmWorkerRuntimeService` — dry-run or live execution, handoff + ownership checks
- `SwarmDispatcherService` — DAG scheduling, concurrency, cancel
- `/swarm run [--dry-run] [run-id]` and `/swarm workers [run-id]`

## Phase 3

- `SwarmIntegrationService` — `manual`, `apply_safe`, `apply_all` patch integration
- Ownership, cross-task conflict, `git apply --check`, secret-path guards
- Mixed worktree changes apply tracked diffs first, then copy approved untracked files into the main workspace
- Auto-integrates after `/swarm run` when mode is `apply_safe`/`apply_all`
- `/swarm integrate [run-id]` for manual mode or re-run
- Final verification in main workspace after integration

## Phase 4 (current)

- `SwarmBridgeRuntimeService.runWorker` — bridge-backed workers via `BridgeRuntimeService.runUserTurnOnSession`
- Serialized turns on the active `/bridge` session when `maxConcurrentSessions <= 1`
- Isolated bridge PTY pool (codex/openrouter: 2) for parallel workers
- Tool roots serialized per worktree (same pattern as `SwarmIsolatedAgentService`)
- `BridgeRuntimeService.runUserTurnOnSession` — session-parameterized turn loop

## Key files

- `commands/swarm-commands.service.ts` — REPL control surface
- `services/swarm-planner.service.ts` — plan generation
- `services/swarm-dispatcher.service.ts` — run orchestration
- `services/swarm-worker-runtime.service.ts` — worker execution + handoff
- `services/swarm-isolated-agent.service.ts` — isolated DeepAgent per worker
- `services/swarm-worktree.service.ts` — git worktree lifecycle
- `services/swarm-integration.service.ts` — apply_safe patch integration
- `services/swarm-run-store.service.ts` — local persistence
- `types/swarm.types.ts` — contracts

Spec: `docs/superpowers/specs/2026-05-20-cast-agent-swarm-sdd.md`
