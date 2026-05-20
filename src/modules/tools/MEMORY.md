# Tools Module Memory

Updated: 2026-05-20

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/tools`.

## Purpose

The tools module owns local tools exposed to the agent: filesystem read/write/edit/list/search, shell/background processes, web search/fetch placeholders, skill/agent/command discovery, snippet saving, and impact analysis.

## Key Files

- `tools.module.ts`: imports config, permissions, memory, platform, benchmark, skills, agents, MCP, vault, scheduler, sandbox, and trace modules; exports registry, discovery, impact, and filesystem services.
- `services/tools-registry.service.ts`: central tool registry and root/workspace propagation.
- `services/filesystem-tools.service.ts`: read/write/edit/glob/grep/ls tools with path guards, read-before-write behavior, and diffs.
- `services/shell-tools.service.ts`: shell and background shell tools with permission checks and cwd guards.
- `services/discovery-tools.service.ts`: list/read skills, list agents/commands including `/bridge`, save snippets, invoke host slash commands, and analyze impact.
- `services/search-tools.service.ts`: web search/fetch tools.
- `services/impact-analysis.service.ts`: import/export impact analysis for a file.

## Boundaries

- Core decides which tools are active for a prompt.
- Permission decisions belong to `permissions`.
- MCP tool conversion lives in `mcp`.
- Runtime memory tools live in `memory`.

## Decisions To Preserve

- Root guards must allow the active project root and approved sibling workspace paths, not arbitrary filesystem access.
- Shell cwd must resolve inside the allowed project/workspace boundary.
- File edits should track read files and produce diffs.
- `cast_command` must route through a host handler; tools should not directly duplicate slash command business logic.
- Command discovery should include detailed `/bridge` context so bridged providers and local agents understand that bridge swaps the provider runtime while Cast still owns tools, permissions, transcripts, and file/shell guards. It should mention that normal prompts route to the bridge until `/bridge stop`.
- Keep isolated tool sets separate from full-session tool sets when used by subagents or controlled runs.

## Tests

Specs cover discovery, filesystem, and shell tools under `src/modules/tools/services`.

Update this file when tool names/schemas, root guards, shell permission flow, file write/edit behavior, discovery tool behavior, or impact analysis changes.
