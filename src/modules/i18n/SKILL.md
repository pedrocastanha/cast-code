# I18n Module

## Overview
Provides internationalization support with English (EN) and Portuguese (PT) locale files, exposed as a global service.

## Role in System
A lightweight global module that provides localized strings throughout the application. Currently supports EN and PT, with a simple key-value lookup system. Used by Config, REPL welcome screen, and any user-facing messages.

## Dependencies
- **Depends on**: None (self-contained locale files)
- **Used by**: ConfigModule, REPL, and any module importing I18nService directly
- **External deps**: None — pure TypeScript locale files

## Key Services/Providers
| Service | Purpose |
|---|---|
| `I18nService` | Loads locale files, manages current language state, provides `t(key)` translation method. Marked as `@Global()` so it's available everywhere without explicit imports. |

## Key Types/Interfaces
No dedicated types file. Locale files are typed as `Record<string, string>` or nested objects.

## Coding Standards & Patterns
- **@Global() module**: The module is decorated with `@Global()` and exports `I18nService`, making it available application-wide without explicit module imports.
- **Locale files**: Stored in `locales/` as TypeScript files (`en.ts`, `pt.ts`). Each exports a locale object.
- **Simple key-value**: Translation system uses dot-notation keys (e.g., `welcome.title`, `config.setup`).
- **Language switching**: `setLanguage(lang)` reloads the locale file. Currently supports `'en'` and `'pt'`.

## Business Rules
- Default language is English.
- Language preference is stored in the user's config (`~/.cast/config.yaml` under `language` field).
- Config module auto-sets language on load: if config has `language` field, `I18nService.setLanguage()` is called automatically.
- Adding a new language requires creating a new file in `locales/` (e.g., `es.ts`) and adding the language code to the supported languages union.

## Circular Dependencies
None.

## Working on This Module
- **Adding translations**: Add keys to both `en.ts` and `pt.ts` (and any new locale file). Keep keys in sync across locales.
- **Locale file structure**: Nested objects for organization. Example: `{ welcome: { title: 'Welcome', subtitle: '...' }, config: { setup: '...' } }`.
- **Adding a new language**: Create `{lang}.ts` in `locales/`, export the translations object with the same key structure. Update the language type union in the service.
- **Very small module**: Only one service file and two locale files. Easy to audit and maintain.
- **No LLM dependency**: This module is purely deterministic — no AI calls.
