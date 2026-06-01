# Project Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/project`.

## Purpose

The project module owns project detection, workspace-root detection, project context loading, project analysis, and generated project instructions.

## Key Files

- `project.module.ts`: provides and exports `ProjectLoaderService`, `ProjectContextService`, and `ProjectAnalyzerService`.
- `services/project-loader.service.ts`: detects Cast project root, detects broader workspace root, loads project config, and returns override paths for agents/skills.
- `services/project-context.service.ts`: stores current analyzed context and formats project context prompts.
- `services/project-analyzer.service.ts`: analyzes project language/framework/architecture/files and generates markdown/instructions.
- `types/project.types.ts`: project context/config/init contracts.

## Boundaries

- Core runtime consumes project context; it does not own detection.
- Filesystem tool path guards use project/workspace roots but are implemented in `tools` and core filesystem backend.
- Platform project binding lives in `.cast/cast.yaml` and is parsed by `platform`.

## Decisions To Preserve

- Project root is the active directory for default operations.
- Workspace root is a broader allowed boundary for sibling package access when the Cast workspace contains packages such as `cast-code`, `backend`, and `web`.
- Keep support for both current override paths and legacy agent/skill override paths.
- Generated project context should stay concise enough to fit prompts.

## Tests

`src/modules/project/services/project-loader.service.spec.ts` covers root/workspace detection. Its fixture `exists` dependency is scoped to each temporary root so ambient `.cast` folders in `/tmp` cannot change expectations. Add or update analyzer/context tests when generated context changes.

Update this file when project-root detection, workspace-root logic, override paths, project analysis, or generated instructions change.
