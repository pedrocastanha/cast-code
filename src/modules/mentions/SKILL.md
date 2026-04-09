# Mentions Module

## Overview
Resolves @-mentions in user input — files, directories, URLs, git references, and other resources — converting them into structured context for the agent.

## Role in System
When users type `@file.ts` or `@src/utils` or `@main` (git branch) in the REPL, this module parses the mention, resolves it to actual content (file contents, directory listing, git log, etc.), and injects the resolved content into the agent's context. Enables natural reference to project resources.

## Dependencies
- **Depends on**: None (self-contained resolution logic)
- **Used by**: CoreModule, REPL, DeepAgentService
- **External deps**: File system, `child_process` (for git operations)

## Key Services/Providers
| Service | Purpose |
|---|---|
| `MentionsService` | Parses user input for @-mentions, resolves each mention type to content. Supports files, directories, URLs, git refs (branches, commits, tags). |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `Mention` | Parsed mention: type ('file' | 'directory' | 'url' | 'git'), raw text, resolved path/ref |
| `MentionResult` | Resolved content with type, path, content, and metadata |

## Coding Standards & Patterns
- **Pattern matching**: Uses regex to detect `@` followed by paths, URLs, or git refs in user input.
- **Content resolution**: For files — reads contents. For directories — lists files. For git refs — runs `git show` or `git log`. For URLs — fetches content.
- **Context injection**: Resolved mentions are formatted and injected into the agent's system prompt or message history.
- **Error tolerance**: Failed mentions (nonexistent files, invalid refs) are gracefully handled — the mention is skipped and a warning may be shown.

## Business Rules
- File mentions resolve relative to the project root.
- Directory mentions list contents (limited depth to avoid huge outputs).
- Git mentions resolve to `git show <ref>` output or commit log.
- URL mentions fetch the URL content (may have limitations on external URLs).
- Mention resolution happens before the agent processes the message — the agent sees resolved content, not raw @-mentions.

## Circular Dependencies
None.

## Working on This Module
- **Adding mention types**: Extend the mention type union, add resolution logic in `MentionsService`, update the parsing regex.
- **Resolution limits**: Be careful with large files/directories — consider adding size limits or truncation for very large resolutions.
- **Testing**: Use sample files in a temp directory to test file and directory mentions. Use a git repo for git mentions.
- **Single service**: Everything is in `mentions.service.ts`. Simple, focused module.
