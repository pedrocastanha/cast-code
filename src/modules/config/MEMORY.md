# Config Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/config`.

## Purpose

The config module owns global CLI configuration: provider credentials, model routing, effort level, first-run setup, and `/config` command flows.

## Key Files

- `config.module.ts`: provides and exports `ConfigManagerService`, `InitConfigService`, and `ConfigCommandsService`.
- `services/config-manager.service.ts`: loads, merges, saves, and queries `~/.cast/config.yaml`.
- `services/init-config.service.ts`: runs first-time setup when no global config exists.
- `services/config-commands.service.ts`: implements `/config`, model/provider/effort menus, and prompt editing.
- `types/config.types.ts`: provider, model, effort, remote, and global platform config contracts.
- `utils/model-context.ts`: model context and token-budget helpers.

## Boundaries

- `/platform` owns platform setup and project linking. `/config` must not become a second platform setup flow.
- Project `.cast/cast.yaml` is owned by `platform`, not by this module.
- Runtime model invocation is owned by `common`/core services; this module only stores and resolves config.

## Decisions To Preserve

- Keep real provider keys in global user config or environment variables, never in project manifests.
- Model routing is by purpose: default, subAgent, coder, architect, reviewer, planner, tester, and economical.
- Preserve effort-level compatibility with `fast`, `balanced`, `deep`, and `max`.
- Tests must isolate config paths so a developer's real `~/.cast/config.yaml` cannot affect expectations.

## Tests

Primary specs live under `src/modules/config/services`, `src/modules/config/types`, and `src/modules/config/utils`.

Update this file when config schema, provider support, model purpose routing, effort semantics, or `/config` behavior changes.
