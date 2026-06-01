# PRD: Cast Skill-Parity Roadmap

## Summary

Cast already has a stronger local product base than Cast in some areas: SQLite state, memory, replayable sessions, schedulers, environments, sandboxing, platform sync, and a CLI built around project work. Cast is still ahead in skill package maturity, skill support-file ergonomics, and workflow polish.

This PRD defines a 7-phase roadmap to close that gap without turning Cast into a flat skill bag. The product direction is:

- Keep Cast skills copied literally.
- Add Cast-native runtime, governance, discovery, and evaluation around them.
- Make environments and sub-agents feel intentional instead of broad lists.
- Prove everything with terminal-run tests and end-to-end Cast sessions.

## Problem

The current Cast skill import gives Cast a large knowledge library, but several parts are incomplete:

- Many Cast skills reference support files through workflows like `skill_view`; Cast loads only the main `SKILL.md` as guidelines.
- Environment classification still relies partly on heuristics.
- Some environments, especially `engineering`, are too broad.
- Cast has a small native sub-agent set compared with the breadth of skill workflows.
- There are unit tests for loading/scoping, but not enough evals showing that each skill improves real task outcomes.
- `$` discovery scales poorly when many skills are available.
- There is no full product-level proof that Cast can create projects from zero using the right environment, skills, sub-agents, memory, scheduler, and eval stack.

## Goals

- Make copied Cast skills fully usable, including references, templates, scripts, and examples.
- Replace keyword-only environment matching with explicit metadata, aliases, triggers, categories, and risk policy.
- Split broad environments into practical task profiles.
- Add useful native sub-agents with scoped ownership and measurable behavior.
- Build golden evals for skill selection, skill injection, and task quality.
- Improve skill/agent discovery in `/skills`, `/agents`, `/env`, `$`, and prompt injection.
- Run complete terminal-based end-to-end tests that ask Cast to create real projects from scratch.

## Non-Goals

- Do not rewrite Cast skill bodies manually.
- Do not activate quarantined or unsafe skills by default.
- Do not preload all skills into every prompt.
- Do not require Cast Platform for local skill/runtime behavior.
- Do not depend on paid external APIs for baseline tests.

## Users

- Solo developer using Cast as a coding agent in local repos.
- Team lead curating project environments and skill packs.
- Power user importing community skills and wanting guardrails.
- Cast maintainer validating product quality before release.

## Success Metrics

- `skill_view` can read support files for copied Cast skills by name and relative path.
- Every built-in environment and profile has zero missing skills/agents.
- `$` suggestions rank relevant agents/skills first within the active environment.
- Golden evals catch wrong skill injection and wrong environment leakage.
- End-to-end project creation tests produce runnable apps with tests, without manual file repair.
- `npm test`, `npm run build`, `npm pack --dry-run`, and the new e2e smoke pass before release.

## Phase 1: Skill Runtime and Support Files

### Context

Cast skills often say things like "load `references/foo.md`" or "use template X". Cast currently loads the main skill content, but support files remain passive files on disk. This makes many copied skills less effective.

### Product Requirements

- Add a `skill_view` style capability for support files.
- Add `list_skill_files` for a skill.
- Allow the agent to open support files only inside the skill package root.
- Keep copied Cast files unchanged.
- Redact or truncate large support files with clear messages.

### Subtasks

- Add `SkillAssetService`.
- Add `SkillRuntimeToolsService` with tools:
  - `list_skill_files(skillName)`
  - `skill_view(skillName, filePath)`
- Extend `SkillDefinition` with package path metadata, without changing skill bodies.
- Update prompts so agents know to use `skill_view` when a skill mentions references/templates.
- Add path traversal protection.
- Add byte limits and binary-file checks.

### Acceptance Criteria

- `$popular-web-designs` can inject the main skill.
- `skill_view("popular-web-designs", "templates/stripe.md")` returns the template.
- `skill_view("popular-web-designs", "../godmode/SKILL.md")` is blocked.
- Support markdown files do not appear as standalone skills.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/skills/**/*.spec.ts
node --test -r ts-node/register src/modules/tools/**/*.spec.ts
npm run build
```

Manual CLI smoke:

```bash
npm run build
node dist/main.js
/env use frontend
$popular-web-designs build a one-screen SaaS dashboard using a template reference
/exit
```

Expected: Cast uses the selected skill and can inspect its template files without generic file search.

## Phase 2: Metadata-Driven Skill Curation

### Context

Current environment scoping uses frontmatter plus heuristics. That caught real leakage, such as security and DevOps skills entering broad environments because of generic words.

### Product Requirements

- Add a sidecar metadata index for copied Cast skills.
- Preserve copied skill files exactly.
- Store aliases, categories, environments, profiles, triggers, risk, trust, and activation policy outside the copied files.
- Make sidecar metadata override heuristic classification.
- Keep quarantined skills inactive unless explicitly approved.

### Subtasks

- Add `src/modules/skills/definitions/cast.cast-skill-index.yaml`.
- Add `SkillMetadataIndexService`.
- Add validator for:
  - unknown skill names
  - duplicate aliases
  - invalid environments
  - unsafe activation flags
- Move high-risk rules into metadata policy.
- Add aliases like:
  - `creative-ideation -> ideation`
  - `docker -> docker-management`
  - `code-review -> github-code-review` only when context is GitHub-specific
- Add `/skills inspect <name>` showing source, aliases, category, risk, environments, support files.

### Acceptance Criteria

- Environment assignment comes from metadata first.
- Keyword fallback only applies to uncataloged local/community skills.
- No copied Cast body is edited.
- Risk and environment leakage tests cover security, DevOps, frontend, marketing, and QA.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/skills/services/skill-loader.service.spec.ts
node --test -r ts-node/register src/modules/environments/services/environment-resolver.service.spec.ts
npm test -- src/modules/skills src/modules/environments
```

Manual CLI smoke:

```bash
npm run build
node dist/main.js
/skills inspect ideation
/skills inspect creative-ideation
/env use security
/skills
/env use marketing
/skills
/exit
```

Expected: aliases resolve clearly, security skills do not appear in marketing unless explicitly configured.

## Phase 3: Lean Environment Profiles

### Context

Environments are useful, but some are still broad. `engineering` has many skills because it includes copied Cast development skills. Users need task-sized profiles, not only domain-sized environments.

### Product Requirements

- Keep environments as domain packs.
- Add profiles inside environments for specific workflows.
- Let users activate `/env use engineering --profile bugfix` or equivalent.
- Profiles narrow agents, skills, MCPs, permission posture, and prompt guidance.

### Proposed Profiles

- `engineering:bugfix`
- `engineering:feature`
- `engineering:review`
- `engineering:refactor`
- `frontend:ui-build`
- `frontend:visual-qa`
- `backend:api`
- `backend:database`
- `devops:deploy`
- `qa:regression`
- `security:audit`
- `marketing:campaign`
- `design:handoff`

### Subtasks

- Extend environment manifest schema with `profiles`.
- Add profile resolution to `EnvironmentResolverService`.
- Persist active profile with environment activation.
- Update `/env list`, `/env inspect`, `/env use`.
- Update `$` suggestions to rank active-profile matches above environment matches.
- Add default profile recommendations based on project type and prompt.

### Acceptance Criteria

- `/env inspect engineering` shows profiles.
- Activating a profile reduces visible skills versus full environment.
- Required skills/agents for each profile resolve.
- Profile prompt includes active profile name and constraints.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/environments/**/*.spec.ts
node --test -r ts-node/register src/modules/repl/services/repl.service.spec.ts
npm run build
```

Manual CLI smoke:

```bash
node dist/main.js
/env use engineering --profile bugfix
/context
$
$systematic-debugging help me isolate a failing test
/env use frontend --profile ui-build
$
/exit
```

Expected: `$` suggestions and injected context differ materially between profiles.

## Phase 4: Native Sub-Agent Library

### Context

Cast has a small base set of agents. Cast has workflow breadth through skills, but not Cast-compatible sub-agent profiles. Cast should build native sub-agents around real workflows and measured outcomes.

### Product Requirements

- Add native agents only when they own a clear workflow.
- Agents must have explicit skills, tools, environments, and expected output shape.
- Agents should not duplicate each other.
- Agents must be scoped by environment/profile.

### Candidate Agents

- `api-engineer`
- `database-engineer`
- `frontend-ui-engineer`
- `visual-qa-reviewer`
- `test-automation-engineer`
- `release-engineer`
- `security-reviewer`
- `docs-writer`
- `research-analyst`
- `project-bootstrapper`

### Subtasks

- Define agent templates and frontmatter contract.
- Add agent validation tests:
  - all skills exist
  - all environments exist
  - no quarantined skill is attached by default
- Update `/agents inspect <name>`.
- Add delegation prompts with ownership rules.
- Add environment/profile mapping.

### Acceptance Criteria

- Each new agent has a measurable job.
- No missing skill references.
- Agents appear only in relevant environments/profiles.
- `$api-engineer` injects enough context to answer "what do you do?" without tool calls.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/agents/**/*.spec.ts
node --test -r ts-node/register src/modules/environments/services/environment-resolver.service.spec.ts
npm run build
```

Manual CLI smoke:

```bash
node dist/main.js
/env use backend --profile api
$api-engineer what do you do and when should I use you?
/env use frontend --profile visual-qa
$visual-qa-reviewer inspect this UI plan
/exit
```

Expected: agent mentions are injected directly and do not trigger discovery tool spam.

## Phase 5: Skill and Agent Evals

### Context

Unit tests prove loading and scoping. They do not prove that skill selection improves outcomes. Cast needs golden evals for behavior.

### Product Requirements

- Add a local eval runner for skill selection and task output quality.
- Keep evals deterministic where possible.
- Allow model-backed evals only behind explicit budget flags.
- Store artifacts under `.cast/benchmarks` or `.cast/evals`.

### Eval Types

- Skill selection eval: prompt -> expected skills/agents.
- Environment leak eval: active env -> forbidden skills absent.
- Mention injection eval: `$name` -> no discovery tool call needed.
- Output rubric eval: task -> expected files, commands, tests, quality signals.
- Regression eval: known bug -> expected fix path and test command.

### Subtasks

- Add `evals/` or `scripts/eval-*` runner.
- Add fixtures for frontend, backend, QA, security, marketing.
- Add `SkillSelectionEvaluator`.
- Add `ToolTraceEvaluator`.
- Add JSONL output with pass/fail details.
- Add `/benchmark quick --template skill-selection` or equivalent.

### Acceptance Criteria

- Evals fail if `oss-forensics` leaks into marketing.
- Evals fail if `$backend` causes read/grep/list tool spam for basic identity questions.
- Evals fail if a frontend task does not inject frontend/design skills.
- Evals run locally without platform.

### Terminal Tests

```bash
npm run typecheck
npm test
node scripts/eval-skill-selection.mjs --fixture evals/fixtures/skill-selection.jsonl
node scripts/eval-environment-leaks.mjs
npm run build
```

Expected: eval reports contain concrete prompt, expected skills, actual skills, tool trace, pass/fail.

## Phase 6: Discovery and CLI UX

### Context

With 180 skills, raw lists become noisy. Users need fast discovery through `$`, `/skills`, `/agents`, `/env`, and `/context`.

### Product Requirements

- `$` suggestions show agents and skills, grouped and ranked.
- Active environment/profile results rank first.
- Search is fuzzy and alias-aware.
- Suggestions include type, source, risk, and short description.
- `/skills` supports filters.

### Subtasks

- Add `SkillSearchService`.
- Add fuzzy matching and aliases.
- Add `/skills search <query>`.
- Add `/skills list --env frontend --risk low --source cast`.
- Add `/agents list --env backend`.
- Update SmartInput suggestion rendering to handle many results.
- Add warnings for quarantined skills.

### Acceptance Criteria

- Typing `$react` suggests `react-patterns` first in frontend.
- Typing `$docker` suggests `docker-management` first in devops.
- Quarantined skills are not suggested by default.
- `/skills search ideation` finds `ideation` and shows alias `creative-ideation`.

### Terminal Tests

```bash
npm run typecheck
node --test -r ts-node/register src/modules/repl/services/repl.service.spec.ts
node --test -r ts-node/register src/modules/repl/services/smart-input.spec.ts
node --test -r ts-node/register src/modules/skills/**/*.spec.ts
npm run build
```

Manual CLI smoke:

```bash
node dist/main.js
/env use devops
$docker
/env use frontend
$docker
$react
/skills search ideation
/skills list --env security
/exit
```

Expected: ranking changes by environment, search finds aliases, unsafe skills stay hidden unless explicitly requested.

## Phase 7: Full End-to-End Product Validation

### Context

After the six implementation phases, Cast needs a release gate that behaves like a user, not like unit tests. The test must ask Cast to create projects from zero, evaluate results, inspect generated files, and run commands.

### Product Requirements

- Add an end-to-end smoke suite that creates temporary projects.
- Use real Cast CLI runs where feasible.
- Validate generated files by running package managers, tests, typecheck, and app smoke commands.
- Capture tool traces, environment prompt, injected skills, cost/tokens, memory writes, and session replay paths.
- Include rollback/sandbox behavior for failed tasks.

### E2E Scenarios

1. Frontend project from zero:
   - Prompt: create a React/Vite task dashboard with responsive UI and tests.
   - Environment: `frontend:ui-build`.
   - Expected skills: `frontend-bootstrap`, `react-patterns`, `popular-web-designs`.
   - Verify: `npm install`, `npm test`, `npm run build`, screenshot or DOM smoke.

2. Backend project from zero:
   - Prompt: create an Express REST API with auth middleware, validation, and tests.
   - Environment: `backend:api`.
   - Expected skills: `api-design`, `database-operations`, `rest-graphql-debug`.
   - Verify: tests, curl smoke, error handling.

3. QA regression pack:
   - Prompt: add tests for an intentionally buggy module.
   - Environment: `qa:regression`.
   - Expected skills: `testing-strategies`, `test-driven-development`, `systematic-debugging`.
   - Verify: failing test first, then passing test.

4. Security audit:
   - Prompt: review a package with a suspicious dependency and shell script.
   - Environment: `security:audit`.
   - Expected skills: `oss-forensics`, `code-review`, `github-code-review`.
   - Verify: no destructive commands, produces findings with file references.

5. DevOps worker:
   - Prompt: create a scheduled health check and install or dry-run worker config.
   - Environment: `devops:deploy`.
   - Expected skills: `docker-management`, `watchers`, `webhook-subscriptions`.
   - Verify: no host mutation unless approved, dry-run artifacts valid.

6. Marketing brief:
   - Prompt: create a launch campaign brief from a product README.
   - Environment: `marketing:campaign`.
   - Expected skills: `marketing-campaign`, `brand-voice`, `ideation`, `youtube-content`.
   - Verify: structured brief, no codebase mutation unless requested.

### Subtasks

- Add `scripts/e2e-cast-projects.mjs`.
- Add fixture prompts under `evals/fixtures/e2e/`.
- Add temporary project generators.
- Add strict artifact collection.
- Add per-scenario graders.
- Add `npm run smoke:e2e`.
- Add CI-friendly timeout and cleanup.

### Acceptance Criteria

- All E2E scenarios pass locally.
- Each scenario reports:
  - active environment/profile
  - injected agents
  - injected skills
  - generated files
  - commands run
  - test results
  - session replay path
  - memory summary path when applicable
- Failures preserve artifacts for inspection.

### Terminal Tests

```bash
npm run typecheck
npm test
npm run build
npm run smoke:e2e
npm pack --dry-run
```

Manual release-candidate run:

```bash
CAST_E2E_KEEP_ARTIFACTS=1 npm run smoke:e2e
node dist/main.js
/sessions search "frontend project from zero"
/resume <session-id>
/exit
```

Expected: artifacts and session replay make it possible to inspect exactly what Cast did and why.

## Release Gates

Before this roadmap is considered done:

```bash
npm run typecheck
npm test
npm run build
npm run smoke:schedule
npm run smoke:e2e
npm pack --dry-run
```

All command output must be captured in the release notes with:

- Date.
- Git commit.
- Node version.
- OS.
- Package size.
- Known skipped tests.
- E2E artifact path.

## Risks

- Some Cast skills assume Cast-specific tools. Mitigation: `skill_view` plus metadata marking unsupported toolsets.
- More skills can increase prompt noise. Mitigation: profiles, ranking, lazy loading.
- E2E tests can be slow or expensive. Mitigation: deterministic local fixtures first, model-backed evals behind flags.
- Unsafe skills can leak into normal workflows. Mitigation: metadata policy, quarantine tests, forbidden-skill evals.

## Open Questions

- Should profiles be persisted in `.cast/cast.yaml` as `environmentProfile`, or nested under environment activation state only?
- Should `skill_view` be exposed to the model by default, or only after a skill reference is injected?
- Should copied Cast optional skills be active by default, or should optional categories require explicit environment/profile opt-in?
- Should the full e2e suite run in CI, or only as release smoke because it may call model APIs?
