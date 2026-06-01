# I18n Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/i18n`.

## Purpose

The i18n module owns lightweight language selection and localized strings for terminal UX and agent language instructions.

## Key Files

- `i18n.module.ts`: provides and exports `I18nService`.
- `services/i18n.service.ts`: stores active language, notifies listeners, and returns language instructions for the agent.
- `locales/en.ts` and `locales/pt.ts`: terminal copy/localized strings.

## Boundaries

- This is not a full translation framework; it is a small in-process service.
- Model/provider config chooses behavior through `config`; this module only contributes language signals.

## Decisions To Preserve

- Supported languages are currently `en` and `pt`.
- Keep `onLanguageChange` callbacks cheap and synchronous.
- Agent language instruction should match the selected UI language.

## Tests

There are no direct specs at the time of writing. Add tests if language selection starts affecting persistence or model routing.

Update this file when supported languages, locale structure, or agent language instruction semantics change.
