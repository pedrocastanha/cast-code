# Skills Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/skills`.

## Purpose

The skills module owns local, built-in, project, user, session, and remote skill definitions; runtime resolution; validation; metadata; asset access; reloads; search; and tools that let agents inspect skill support files.

## Key Files

- `skills.module.ts`: imports `ToolsModule` and `TraceModule`; provides loader, registry, search, validation, scope resolver, reload, asset, runtime-tool, version, and metadata-index services.
- `services/skill-loader.service.ts`: loads built-in/project/remote skills, applies metadata, filters environment scope, and reads bundled skill packages.
- `services/skill-registry.service.ts`: resolves skills, guidelines, and skill-specific tools for runtime use.
- `services/skill-search.service.ts`: ranks skills and agents for discovery queries.
- `services/skill-scope-resolver.service.ts`: resolves runtime scope and detects conflicts.
- `services/skill-reload.service.ts`: reloads one/all skills and writes trace events.
- `services/skill-asset.service.ts` and `skill-runtime-tools.service.ts`: list/read support files for selected skills.
- `services/skill-validation.service.ts`, `skill-version.service.ts`, `skill-metadata-index.service.ts`: validation, hashing, and metadata support.
- `definitions/`: bundled skill catalog.
- `types/skill.types.ts` and `types/skill-runtime.types.ts`: skill definition and runtime contracts.

## Boundaries

- Hermes-style import/conversion belongs to `skills-import`.
- Platform payload adaptation belongs to `platform`; this module loads the adapted remote definitions.
- Tool execution lives in `tools`; this module can expose skill-scoped tool sets.

## Decisions To Preserve

- Skills should be discoverable and selected by task/environment, not all injected into every prompt.
- Remote skills can be inactive/quarantined but still retained for governance/scanning.
- Environment scoping must be reversible and must not destroy the unscoped skill registry.
- Keep bundled/public metadata normalized for catalog display and search.
- Support-file reads must stay scoped to the selected skill package.

## Tests

Specs cover loader, metadata index, reload, runtime tools, scope resolver, search, and asset behavior under `src/modules/skills/services`.

Update this file when skill file format, metadata, source precedence, environment scoping, runtime tool names, or validation rules change.
