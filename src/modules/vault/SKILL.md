# Vault Module

## Overview
Code snippet storage — provides a persistent store for saving and retrieving useful code patterns, snippets, and solutions.

## Role in System
Acts as a code snippet library where agents and users can save reusable code patterns. Useful for storing common solutions, boilerplate patterns, and frequently-needed code blocks that agents can reference in future sessions.

## Dependencies
- **Depends on**: None (self-contained, file-based)
- **Used by**: ToolsModule (vault tools), REPL (VaultCommandsService)
- **External deps**: File system operations

## Key Services/Providers
| Service | Purpose |
|---|---|
| `VaultService` | Stores, retrieves, and searches code snippets. Provides CRUD operations for vault entries with tags and descriptions. |

## Key Types/Interfaces
No dedicated types file. Vault entries likely contain: id, code, description, tags[], language, createdAt.

## Coding Standards & Patterns
- **Snippet storage**: File-based or SQLite storage for code snippets with metadata.
- **Search and retrieval**: Supports searching by tags, description, or content.
- **Tool exposure**: Vault operations are exposed as tools so agents can save and retrieve snippets during conversations.

## Business Rules
- Snippets are project-scoped (stored in `.cast/vault/`) or global (stored in `~/.cast/vault/`).
- Tags enable organized retrieval — agents can search for snippets by tag.
- Snippets persist across sessions — the vault grows over time with usage.

## Circular Dependencies
None. VaultModule is a leaf module.

## Working on This Module
- **Single service**: Everything is in `vault.service.ts`. Simple module.
- **REPL commands**: `/vault` command group for managing snippets via REPL.
- **Agent access**: Agents access vault through tool calls (provided via ToolsModule integration).
- **Storage format**: Likely JSON files or SQLite. Check the service for exact implementation.
