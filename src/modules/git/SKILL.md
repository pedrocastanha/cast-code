# Git Module

## Overview
LLM-backed git operations: commit message generation, PR creation, code review, release notes, monorepo detection, and unit test generation.

## Role in System
Provides intelligent git workflows powered by LLMs. The git module goes beyond simple git operations — it uses AI to generate meaningful commit messages, create pull requests with descriptions, perform code reviews, generate release notes, and even suggest unit tests. It's used by REPL git commands and can be invoked programmatically.

## Dependencies
- **Depends on**: CommonModule, CoreModule (forwardRef — for LLM access)
- **Used by**: REPL (GitCommandsService), standalone via direct injection
- **External deps**: `child_process` (execSync for git commands), `@langchain/core` (for LLM calls in services)

## Key Services/Providers
| Service | Purpose |
|---|---|
| `CommitGeneratorService` | Analyzes git diff, uses LLM to generate conventional commit messages. Supports scope detection and multi-change commits. |
| `MonorepoDetectorService` | Detects if the current project is a monorepo, identifies packages/workspaces, and determines which packages are affected by changes. |
| `PrGeneratorService` | Creates pull requests with AI-generated titles, descriptions, and change summaries. |
| `CodeReviewService` | Performs AI-powered code reviews on staged/unstaged changes or specific files. |
| `ReleaseNotesService` | Generates release notes from git history and commit messages. |
| `UnitTestGeneratorService` | Analyzes code changes and generates or updates unit tests. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `GitCommitOptions` | Options for commit generation: scope, type, includeBreakingChanges |
| `PrResult` | PR generation result: title, description, labels |
| `CodeReviewResult` | Review findings: issues[], suggestions[], overallAssessment |

## Coding Standards & Patterns
- **LLM-heavy services**: Each service makes LLM calls via the injected CoreModule. Prompts are defined inline in the service files (see `commit-prompts.ts` for commit-specific prompts).
- **Git via execSync**: All git operations use `child_process.execSync()` — synchronous execution for simplicity.
- **Monorepo awareness**: `MonorepoDetectorService` checks for `package.json` workspaces, `nx.json`, `lerna.json`, and `pnpm-workspace.yaml` to detect monorepo structure.
- **Conventional commits**: Commit messages follow conventional commit format (type, scope, description, body).
- **Prompt separation**: Commit prompts are in a separate `commit-prompts.ts` file for easy tuning without touching service logic.

## Business Rules
- Commit generation analyzes the current git diff — unstaged changes are not considered.
- Monorepo detection runs before commit generation to determine scope automatically.
- Code reviews analyze diff and return structured feedback with severity levels.
- Unit test generation respects existing test patterns (detects Jest, Vitest, etc.).
- Release notes are generated from commit history between tags or since last release.

## Circular Dependencies
- `GitModule` → `forwardRef(CoreModule)` — git services need LLM access via Core; Core doesn't import Git (one-way cycle through forwardRef).

## Working on This Module
- **Prompt tuning**: Commit and review prompts are the most frequently tuned parts. They're in `commit-prompts.ts` and inline in respective services.
- **Adding a new git operation**: Create a new service in `services/`, inject CoreModule for LLM access, use `execSync('git ...')` for git operations.
- **Test file present**: `git.module.spec.ts` exists — follow its patterns for unit tests.
- **Unit test generator**: Has its own spec file (`unit-test-generator.service.spec.ts`). Use it as reference for testing LLM-backed services.
- **Git commands in REPL**: The actual REPL command handlers are in `repl/services/commands/git-commands.service.ts`, not here. This module provides the underlying services.
