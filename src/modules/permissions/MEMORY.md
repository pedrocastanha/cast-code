# Permissions Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/permissions`.

## Purpose

The permissions module owns command approval state, permission prompts, allow/deny rules, and danger-level classification for shell-like actions.

## Key Files

- `permissions.module.ts`: provides and exports `PermissionService` and `PromptService`.
- `services/permission.service.ts`: loads rules, classifies command danger, checks session/global rules, supports headless handlers, and updates rules.
- `services/prompt.service.ts`: wraps terminal question/confirm/status output.
- `types/permission.types.ts`: response, rule, and config contracts.

## Boundaries

- Shell execution lives in `tools/ShellToolsService`; this module decides approval.
- Sandbox policy lives in `sandbox` and benchmark/scheduler policy services.
- Platform governance may add product policy later but should not bypass local permission checks.

## Decisions To Preserve

- Dangerous commands need explicit approval unless a matching rule allows them.
- Headless mode must use an injected permission handler rather than interactive prompts.
- Keep session rules clearable so one task does not silently authorize later unrelated work.
- Pattern matching should be predictable and conservative.

## Tests

There are no direct specs at the time of writing. Add tests when changing danger classification, rule persistence, or pattern matching.

Update this file when permission rule shape, command classification, prompt behavior, or headless policy changes.
