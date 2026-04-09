# Memory Module

## Overview
Project memory system with MEMORY.md support and file-based key-value store for persistent agent knowledge across sessions.

## Role in System
Provides persistent memory that survives between sessions. Agents can write to memory (via MEMORY.md or KV store) and read from it to maintain context about the project, decisions made, and important information. Used by Core (DeepAgentService) for context injection.

## Dependencies
- **Depends on**: None (self-contained, file-based)
- **Used by**: CoreModule (forwardRef), REPL (memory commands), Project module
- **External deps**: File system operations (`fs/promises`)

## Key Services/Providers
| Service | Purpose |
|---|---|
| `MemoryService` | Core memory operations — reads/writes MEMORY.md, manages file-based KV store. Provides get/set/delete/search operations. |
| `MemoryToolsService` | Wraps memory operations as LangChain StructuredTools so agents can interact with memory through the tool system. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `MemoryEntry` | KV store entry: key, value, timestamp, metadata |
| `MemoryResult` | Result of memory operations: success, data, error |

## Coding Standards & Patterns
- **MEMORY.md**: A markdown file in the project root (or `.cast/`) that serves as the project's long-term memory. Agents read and append to it.
- **File-based KV store**: Separate from MEMORY.md, a structured KV store persists as JSON or similar format in `.cast/`.
- **Tool exposure**: `MemoryToolsService` exposes memory operations as tools, so agents can `read_memory`, `write_memory`, `search_memory`, etc.
- **Dual storage**: MEMORY.md for human-readable narrative memory; KV store for structured, programmatic memory.

## Business Rules
- MEMORY.md is project-specific — stored in the project directory or `.cast/`.
- Agents can read and write to memory during conversations.
- Memory persists across sessions — it's loaded on project initialization.
- Search functionality allows agents to find relevant memory entries by keyword.

## Circular Dependencies
- `MemoryModule` ↔ `CoreModule` (forwardRef on Core side) — core uses memory for context, memory doesn't directly import core.

## Working on This Module
- **MEMORY.md format**: Free-form markdown. Agents append sections with timestamps. No strict schema.
- **KV store format**: Likely JSON file in `.cast/memory.json` or similar directory. Check `MemoryService` for exact path.
- **Adding memory tools**: Extend `MemoryToolsService` with new `StructuredTool` definitions for additional memory operations.
- **Memory scope**: Memory is project-scoped — each project has its own MEMORY.md and KV store.
- **Testing**: File-based, so tests can use temp directories and verify file contents.
