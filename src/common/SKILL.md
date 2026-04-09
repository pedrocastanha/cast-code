# Common Module

## Overview
Shared infrastructure — LLM factory, markdown parsing, markdown rendering, and global configuration service. Provides foundational utilities used across all modules.

## Role in System
The foundational layer. Provides the LLM abstraction layer (MultiLlmService), markdown processing (parser and renderer), and the global ConfigService that wraps ConfigManager for easy access. Marked as `@Global()` so its services are available everywhere without explicit module imports.

## Dependencies
- **Depends on**: ConfigModule (for configuration loading)
- **Used by**: Every module — Core, Agents, Skills, Git, and virtually all others
- **External deps**: `@langchain/core` (chat models, messages), `@langchain/openai`, `@langchain/anthropic`, etc. (provider-specific SDKs), markdown parsing library

## Key Services/Providers
| Service | Purpose |
|---|---|
| `MultiLlmService` | LLM factory — creates chat model instances for any provider (OpenAI, Anthropic, Gemini, Ollama, etc.) based on purpose (default, coder, planner, etc.). Abstracts away provider-specific configuration. |
| `MarkdownParserService` | Parses markdown files with YAML frontmatter. Extracts frontmatter as typed objects and content as raw strings. Used by Agents and Skills loaders. |
| `MarkdownRendererService` | Renders markdown to HTML or formatted text. Used for displaying markdown content in REPL, web UI, etc. |
| `ConfigService` | Lightweight wrapper around ConfigManagerService for global access to current config. Since CommonModule is @Global(), this is available everywhere. |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `MarkdownParseResult<T>` | Result of parsing a markdown file: frontmatter (typed as T), content (raw string) |
| `ParsedMarkdown` | Non-generic version: frontmatter as Record<string, unknown>, content as string |

## Coding Standards & Patterns
- **@Global() module**: Marked as `@Global()` so services are available application-wide without explicit imports. This is intentional — these are truly foundational.
- **LLM abstraction**: `MultiLlmService.createModel(purpose)` creates the right LLM for the job based on config. Hides provider details from callers.
- **Purpose-based routing**: Model creation uses purpose keys (`'default'`, `'coder'`, `'planner'`, etc.) which map to specific provider/model configurations.
- **Generic frontmatter parsing**: `MarkdownParserService.parseAll<T>()` is generic — callers specify the frontmatter type. Used by both Agents (AgentFrontmatter) and Skills (SkillFrontmatter).
- **Directory scanning**: `parseAll()` scans an entire directory for `.md` files and parses them all, returning a Map of path → result.

## Business Rules
- MultiLlmService reads model configuration from ConfigModule on each call — config changes take effect immediately.
- Markdown parser handles both files with and without frontmatter — files without frontmatter return empty frontmatter objects.
- ConfigService provides read-only access to the current config state.

## Circular Dependencies
None on the Common side. CommonModule imports ConfigModule but not vice versa. Many modules import CommonModule.

## Working on This Module
- **MultiLlmService is critical**: This is the single point of LLM creation. All AI calls in the system go through here. If a model isn't working, check this service first.
- **Adding LLM providers**: Extend `MultiLlmService` with a new provider case. The provider must have a LangChain integration package.
- **Markdown parser**: Used by Agents and Skills modules. Changes here affect how agent and skill definitions are loaded. Test with existing `.md` files after modifications.
- **ConfigService vs ConfigManagerService**: `ConfigService` (Common) is a thin wrapper for global access. `ConfigManagerService` (Config module) handles actual loading/saving. Don't confuse them.
- **Constants**: `src/common/constants/index.ts` exports shared constants like `DEFAULT_MODEL`, `DEFAULT_TEMPERATURE`. These are referenced throughout the codebase.
- **Type exports**: `src/common/types/` exports markdown types and re-exports from other type modules.
