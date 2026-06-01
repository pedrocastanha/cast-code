# Mentions Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/mentions`.

## Purpose

The mentions module expands `@...` references in user prompts into structured context blocks.

## Key Files

- `mentions.module.ts`: provides and exports `MentionsService`.
- `services/mentions.service.ts`: parses mentions, resolves files/directories/URLs/git commands, truncates large content, and builds expanded messages.
- `types/mention.types.ts`: parsed/resolved mention contracts.

## Supported Mentions

- Files and directories, resolved from `process.cwd()`.
- URLs via `fetch` with timeout and content length cap.
- Git commands: `@git:status`, `@git:diff`, `@git:log`, `@git:branch`, and `@git:stash`.

## Boundaries

- REPL autocomplete and `@agent`/`@skill` style references are handled in `repl`; this module handles content expansion.
- Workspace-aware sibling path guards primarily live in `tools`/core filesystem backend. Be careful before changing mention path resolution.

## Decisions To Preserve

- Keep file, directory, and URL limits to avoid unbounded prompt injection.
- Preserve structured tags such as `<file>`, `<directory>`, `<url>`, `<git>`, and `<mention_error>`.
- Mention resolution should return inline errors instead of throwing the whole prompt flow.

## Tests

There are no direct specs at the time of writing. Add focused tests before changing mention parsing regex, truncation limits, or supported git commands.

Update this file when mention syntax, supported sources, content limits, or expanded-message structure changes.
