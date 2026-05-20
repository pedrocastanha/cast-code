# Skills Import Module Memory

Updated: 2026-05-19

Read the root `MEMORY.md` first. This file captures module-local decisions for `src/modules/skills-import`.

## Purpose

The skills-import module owns importing and curating Hermes-style `SKILL.md` packages into Cast's governed skill format.

## Key Files

- `skills-import.module.ts`: imports `SkillsModule`; provides command, discovery, converter, duplicate detector, environment classifier, and risk scanner.
- `commands/skills-import-commands.service.ts`: CLI command handler for discovery/import reporting.
- `services/skill-package-discovery.service.ts`: finds candidate skill packages in a repo path.
- `services/skill-converter.service.ts`: converts Hermes skill metadata/body into Cast governed markdown.
- `services/skill-duplicate-detector.service.ts`: detects duplicate/similar names and content.
- `services/skill-environment-classifier.service.ts`: classifies imported skills into Cast environment tags.
- `services/skill-risk-scanner.service.ts`: flags prompt injection, secret exfiltration, destructive commands, network risks, and similar issues.
- `types/skills-import.types.ts`: import reports, risk, duplicate, conversion, and environment contracts.

## Boundaries

- Runtime skill loading belongs to `skills`; this module prepares/imports skill files and reports risk.
- Environment activation belongs to `environments`; this module only classifies likely environment tags.

## Decisions To Preserve

- Imported skills are not automatically trusted just because they parse.
- Keep risky skills inactive/quarantined by default through governance metadata.
- Duplicate detection should consider both names and body/guidelines similarity.
- Preserve enough reporting detail for a human to review before activating imported skills.

## Tests

Specs cover command handling, converter, duplicate detector, environment classifier, discovery, and risk scanner under `src/modules/skills-import`.

Update this file when import format, risk categories, duplicate heuristics, environment tags, or generated governed markdown changes.
