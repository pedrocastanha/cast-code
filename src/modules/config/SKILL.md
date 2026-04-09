# Config Module

## Overview
Manages multi-provider LLM configuration (OpenAI, Anthropic, Gemini, Ollama, DeepSeek, Kimi, OpenRouter) with purpose-based model mapping, stored as YAML in `~/.cast/config.yaml`.

## Role in System
This is the single source of truth for all LLM provider credentials, model assignments, and global settings. Every module that interacts with LLMs ultimately reads configuration from here. The `ConfigManagerService` handles load/save, while `InitConfigService` guides first-time setup.

## Dependencies
- **Depends on**: I18nModule (for localized prompts during setup)
- **Used by**: Common (ConfigService), Core, REPL, Remote, and virtually all modules that interact with LLMs
- **External deps**: `js-yaml`, `fs/promises`, `os` (homedir), `path`

## Key Services/Providers
| Service | Purpose |
|---|---|
| `ConfigManagerService` | Core config CRUD — loads from `~/.cast/config.yaml`, validates, merges with defaults, saves. Handles model purpose mapping (default, coder, planner, reviewer, etc.). |
| `InitConfigService` | Interactive first-time setup wizard — guides user through provider selection, API key entry, and model assignment. |
| `ConfigCommandsService` | REPL command handlers for config management (`/config`, `/set-model`, etc.). |

## Key Types/Interfaces
| Type | Purpose |
|---|---|
| `CastConfig` | Root config: version, providers{}, models{}, remote?, language? |
| `ProvidersConfig` | Map of provider configs: openai?, anthropic?, gemini?, kimi?, ollama?, deepseek?, openrouter? |
| `ModelConfig` | Per-purpose model config: provider, model, temperature?, maxTokens? |
| `ModelPurpose` | Union type: `'default' | 'subAgent' | 'coder' | 'architect' | 'reviewer' | 'planner' | 'tester' | 'cheap'` |
| `ProviderType` | Union: `'openai' | 'anthropic' | 'gemini' | 'kimi' | 'ollama' | 'deepseek' | 'openrouter'` |
| `ProviderMetadata` | Provider info: name, description, requiresApiKey, defaultBaseUrl, websiteUrl, popularModels |
| `PROVIDER_METADATA` | Constant record of metadata for all 7 supported providers |
| `MODEL_PURPOSES` | Array of model purpose descriptors with labels and descriptions |

## Coding Standards & Patterns
- **YAML storage**: Config persists as `~/.cast/config.yaml`. Version field enables future migrations.
- **Merge with defaults**: `loadConfig()` always merges loaded config with `DEFAULT_CONFIG` — missing fields get sensible defaults.
- **Provider abstraction**: Each provider type has its own interface extending `BaseProviderConfig` (apiKey?, baseUrl?). Ollama uses `baseUrl` only (no API key).
- **Purpose-based model routing**: Models are assigned to purposes (default, coder, planner, etc.) so different tasks can use different models.
- **Language propagation**: Config's `language` field propagates to `I18nService` on load.
- **Defensive file I/O**: Missing config file (`ENOENT`) is not an error — falls back to defaults. Other errors are warned but don't crash.

## Business Rules
- Config file location is hardcoded: `~/.cast/config.yaml` (cross-platform via `os.homedir()`).
- Version is always set to `CONFIG_VERSION` (currently 1) on save — enables future schema migrations.
- Ollama is the only provider that doesn't require an API key (local, private).
- Model purposes include: default, subAgent, coder, architect, reviewer, planner, tester, cheap — each can point to a different provider/model.
- Remote config (ngrok) is optional and stored under `remote{}` in the config.

## Circular Dependencies
None. ConfigModule has no forwardRef cycles.

## Working on This Module
- **Adding a new provider**: Add to `ProviderType` union, create `{ProviderName}Config` interface, add to `ProvidersConfig`, add entry in `PROVIDER_METADATA`, update validation in `config-manager.service.ts`.
- **Testing config changes**: Use `InitConfigService` for interactive flow, or directly call `ConfigManagerService.loadConfig()` / `saveConfig()`.
- **Default config**: `DEFAULT_CONFIG` in `config-manager.service.ts` sets OpenAI `gpt-4.1-nano` as the default model.
- **Validation**: The module performs basic validation on model config (required fields, valid provider types). Add new validation rules in `config-manager.service.ts`.
- **i18n integration**: The `I18nService` is injected and language is set automatically when config loads — this means setup prompts are localized.
