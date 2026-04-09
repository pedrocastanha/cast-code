# Project Module

## Overview
Project context loading and analysis — detects `.cast/` directory, loads project configuration, analyzes project structure, and builds context for agents.

## Role in System
When Cast Code starts in a directory, the Project module scans the project structure, reads `.cast/` configuration files, detects framework/language, and builds a comprehensive project context that agents use to understand the codebase they're working with.

## Dependencies
- **Depends on**: None (self-contained scanning and analysis)
- **Used by**: CoreModule, REPL, Tasks
- **External deps**: File system, path operations

## Key Services/Providers
| Service | Purpose |
|---|---|
| `ProjectLoaderService` | Detects and loads project configuration from `.cast/` directory. Reads project-specific settings and agent/skill overrides. |
| `ProjectContextService` | Builds and manages project context — directory structure, key files, detected frameworks, language, build tools. Provides context strings for agent system prompts. |
| `ProjectAnalyzerService` | Analyzes the project to detect framework (NestJS, Next.js, etc.), language (TypeScript, Python, etc.), package manager, test framework, and other structural information. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `ProjectInitResult` | Result of project initialization: root, structure, config, detected features |
| `ProjectContext` | Full project context: structure string, framework, language, dependencies, build commands |

## Coding Standards & Patterns
- **`.cast/` directory**: Project-specific configuration directory. Contains project settings, agent overrides, memory, and other project-scoped data.
- **Structure scanning**: Recursively scans the project directory, respecting `.gitignore` patterns, to build a tree representation.
- **Framework detection**: Looks for telltale files (`nest-cli.json` → NestJS, `next.config.js` → Next.js, `Cargo.toml` → Rust, etc.).
- **Context string generation**: Produces a formatted string representation of the project structure and key information, injected into agent system prompts.
- **Lazy loading**: Project analysis can be expensive — results are cached and only refreshed when file changes are detected.

## Business Rules
- `.cast/` directory is the project's Cast Code configuration root.
- Project scanning runs on initialization and can be triggered manually.
- Context includes: directory tree (limited depth), key config files, detected framework, language, build/test commands.
- Project context is injected into every agent's system prompt for workspace awareness.
- Large projects may have truncated directory trees — only top-level and key directories are shown.

## Circular Dependencies
None.

## Working on This Module
- **Adding framework detection**: Add detection logic in `ProjectAnalyzerService` — look for framework-specific files and config patterns.
- **Context size management**: The context string can become very large for big projects. Check `ProjectContextService` for truncation and summarization logic.
- **`.cast/` contents**: Can include project config, agent overrides, memory files, and custom skill/agent definitions.
- **Performance**: Project analysis involves filesystem scans — keep it efficient. Cache results and only refresh on changes.
- **Three services**: Loader (config), Context (structure/context building), Analyzer (framework/language detection). Clean separation of concerns.
