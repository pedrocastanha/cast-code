# Memory Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/memory`.

## Purpose

The memory module owns CLI-local assistant memory and memory tools. It is distinct from Cast Platform RAG/memory, although `MemoryToolsService` also exposes platform-backed `rag_search` when available.

## Key Files

- `memory.module.ts`: imports `StateModule` and `PlatformModule`; provides and exports `MemoryService` and `MemoryToolsService`.
- `services/memory.service.ts`: initializes local memory files, formats memory prompts, writes/reads/searches memories, blocks risky memory writes, and uses SQLite FTS when available.
- `services/memory-tools.service.ts`: exposes `memory_write`, `memory_read`, `memory_search`, and `rag_search` tools.
- `types/memory.types.ts`: local memory entry contract.

## Boundaries

- Project-level repo memory docs such as root `MEMORY.md` and module `MEMORY.md` files are documentation for future agents; they are not the same as the runtime memory store.
- Platform RAG document retrieval is owned by `platform` and backend APIs; this module only exposes the runtime tool facade.
- Local session persistence belongs to `state`.

## Decisions To Preserve

- CLI local memory and platform RAG must remain conceptually separate in code and docs.
- `rag_search` should not crash on empty queries; return overview/unavailable messages as appropriate.
- Block obvious prompt-injection, exfiltration, or system-instruction override content from memory writes.
- Search should degrade gracefully if SQLite/FTS is unavailable.

## Tests

Specs live under `src/modules/memory/services/*.spec.ts`.

Update this file when memory file layout, memory tool names, RAG behavior, injection filters, or FTS fallback behavior changes.
