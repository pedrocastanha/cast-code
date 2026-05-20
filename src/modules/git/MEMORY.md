# Git Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/git`.

## Purpose

The git module owns git-oriented assistant workflows: commit message generation, split commits, push, PR descriptions, code review/fix helpers, release notes, unit-test generation, and monorepo scope detection.

## Key Files

- `git.module.ts`: imports `CommonModule` and `CoreModule`; exports commit, PR, review, release, and unit-test services.
- `services/commit-generator.service.ts`: reads diffs, builds Conventional Commit messages, split-commit plans, commits, and pushes.
- `services/monorepo-detector.service.ts`: infers workspace packages and commit scopes from changed files.
- `services/pr-generator.service.ts`: detects branch/platform/base, analyzes commits, and creates PR title/body or URLs.
- `services/code-review.service.ts`: reviews files/diffs and can ask the model to fix a file.
- `services/unit-test-generator.service.ts`: detects changed source files/frameworks and generates tests.
- `services/release-notes.service.ts`: builds release notes from commits, changed files, dependencies, and contributors.
- `types/git.types.ts`: git diff and split-commit contracts.

## Boundaries

- Slash command UI for git flows lives in `repl/services/commands/git-commands.service.ts`.
- Model access comes through `CommonModule`/LLM services and core.
- Permission and destructive-command gating are not owned here.

## Decisions To Preserve

- `/up` and `/split-up` should keep user confirmation in the REPL command layer.
- Commit messages should stay normalized to accepted Conventional Commit types and inferred scopes.
- Split commits must avoid losing user changes and should report original HEAD on failure.
- PR generation should keep platform detection broad but safe: GitHub, Azure, GitLab, Bitbucket, or unknown.
- Unit-test generation should validate generated tests for changed symbols and framework conventions.

## Tests

Specs cover module wiring, code review, PR generation, and unit-test generation under `src/modules/git`.

Update this file when git command semantics, commit normalization, PR templates, review/fix behavior, or generated-test validation changes.
