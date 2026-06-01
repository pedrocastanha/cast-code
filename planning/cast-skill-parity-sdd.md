# SDD: Cast Skill-Parity Architecture

## Purpose

This SDD maps the 7-phase PRD into concrete services, data contracts, files, and test strategy. The design keeps Cast skill bodies immutable and adds Cast-native runtime behavior around them.

## Current Architecture Touchpoints

- `src/modules/skills`
  - Loads built-in, local, remote, and copied Cast skills.
  - Current loader indexes only `SKILL.md` for Cast packages.
  - Needs support-file runtime and metadata sidecar.
- `src/modules/environments`
  - Loads environment manifests.
  - Applies active scope to agents, skills, and MCPs.
  - Needs profiles and stronger validation.
- `src/modules/agents`
  - Loads agent markdown definitions.
  - Needs a broader native agent library and validation.
- `src/modules/repl`
  - Owns `$` suggestions and mention injection.
  - Needs ranked discovery and richer inspect commands.
- `src/modules/benchmark`
  - Already has benchmark execution and environment task target types.
  - Can host part of the eval/e2e layer.
- `src/modules/state`
  - Owns local SQLite state, sessions, memory, and replay metadata.
  - Should store e2e/eval summaries if needed.

## Phase 1 Design: Skill Runtime and Support Files

### New Services

`SkillAssetService`

Responsibilities:

- Resolve a skill by name or alias.
- Locate its package root.
- List support files under the package root.
- Read a support file by relative path.
- Enforce path traversal guardrails.
- Enforce max bytes and binary checks.

Suggested path:

```text
src/modules/skills/services/skill-asset.service.ts
```

`SkillRuntimeToolsService`

Responsibilities:

- Expose model tools:
  - `list_skill_files`
  - `skill_view`
- Format results for model consumption.
- Apply redaction/truncation policy.

Suggested path:

```text
src/modules/skills/services/skill-runtime-tools.service.ts
```

### Type Changes

Extend `SkillDefinition`:

```ts
interface SkillDefinition {
  packageRoot?: string;
  definitionPath?: string;
  supportFiles?: string[];
  aliases?: string[];
  category?: string;
}
```

### Tool Contract

`list_skill_files`

Input:

```json
{ "skillName": "popular-web-designs" }
```

Output:

```text
Skill popular-web-designs support files:
- templates/stripe.md
- templates/linear.md
```

`skill_view`

Input:

```json
{ "skillName": "popular-web-designs", "filePath": "templates/stripe.md" }
```

Output:

```text
# popular-web-designs: templates/stripe.md
...
```

### Guardrails

- Reject absolute paths.
- Reject `..`.
- Reject symlink escape.
- Reject files outside package root after `realpath`.
- Limit default read to 40 KB.
- Return "truncated" metadata when capped.

### Tests

Unit:

```bash
node --test -r ts-node/register src/modules/skills/services/skill-asset.service.spec.ts
node --test -r ts-node/register src/modules/skills/services/skill-runtime-tools.service.spec.ts
```

Integration:

```bash
node --test -r ts-node/register src/modules/core/services/deep-agent.service.spec.ts
node --test -r ts-node/register src/modules/repl/services/repl.service.spec.ts
```

Manual:

```bash
npm run build
node dist/main.js
/env use frontend
$popular-web-designs use the Linear template and create a compact admin page
```

## Phase 2 Design: Metadata-Driven Skill Curation

### New Sidecar File

```text
src/modules/skills/definitions/cast.cast-skill-index.yaml
```

Example:

```yaml
version: 1
sourceRepo: nousresearch/cast-agent
skills:
  ideation:
    sourcePath: skills/creative/creative-ideation/SKILL.md
    aliases:
      - creative-ideation
    category: creative
    environments:
      - marketing
      - design
    profiles:
      - marketing:campaign
    risk: low
    trust: community
  oss-forensics:
    sourcePath: optional-skills/security/oss-forensics/SKILL.md
    category: security
    environments:
      - security
    profiles:
      - security:audit
    risk: medium
    trust: community
  godmode:
    sourcePath: skills/red-teaming/godmode/SKILL.md
    category: red-teaming
    environments:
      - security
    risk: critical
    trust: quarantined
    isActive: false
```

### New Services

`SkillMetadataIndexService`

- Loads sidecar YAML.
- Validates schema.
- Provides lookup by name, source path, and alias.

`SkillAliasService`

- Resolves aliases.
- Handles collisions.
- Explains alias resolution in `/skills inspect`.

### Schema Rules

- `version` must be `1`.
- All indexed skills must exist in loaded skills.
- All aliases must be unique after lowercasing.
- `risk: critical` requires `isActive: false` unless an explicit local override exists.
- Unknown environments fail tests.

### Loader Flow

1. Load copied Cast `SKILL.md`.
2. Compute source path and package root.
3. Read sidecar metadata.
4. Apply metadata override.
5. Fall back to classifier only if no metadata exists.
6. Add aliases to lookup map.

### Tests

```bash
node --test -r ts-node/register src/modules/skills/services/skill-metadata-index.service.spec.ts
node --test -r ts-node/register src/modules/skills/services/skill-loader.service.spec.ts
node --test -r ts-node/register src/modules/environments/services/environment-resolver.service.spec.ts
```

## Phase 3 Design: Lean Environment Profiles

### Manifest Extension

Extend `castEnvironmentManifestSchema`:

```yaml
profiles:
  bugfix:
    description: Debug and fix a failing behavior with focused test-first tools.
    agents:
      required: [coder, tester]
      optional: [reviewer]
    skills:
      required: [test-driven-development, systematic-debugging]
      optional: [requesting-code-review]
    permissions:
      defaultMode: balanced
      requireApproval: [destructive_command]
```

### State Changes

Persist active profile:

- `.cast/cast.yaml`
  - `environment: engineering`
  - `environmentProfile: bugfix`
- SQLite `environment_activations`
  - add `profile_id` nullable column

### Resolver Changes

`EnvironmentResolverService`:

- `resolveProfile(environment, profileId)`
- `applyActiveScope(projectRoot)` merges base env and profile.
- Profile required/optional lists override or narrow base lists.

### CLI Changes

Commands:

```text
/env use engineering --profile bugfix
/env inspect engineering --profile bugfix
/env profiles engineering
```

### Tests

```bash
node --test -r ts-node/register src/modules/environments/**/*.spec.ts
node --test -r ts-node/register src/modules/repl/services/repl.service.spec.ts
```

Key assertions:

- Profile scope is smaller than environment scope.
- Required profile skills resolve.
- Profile prompt includes environment and profile.
- `$` suggestions rank profile skills first.

## Phase 4 Design: Native Sub-Agent Library

### Agent File Contract

Agent definitions remain markdown with frontmatter:

```yaml
---
name: api-engineer
description: Backend API specialist for route design, validation, errors, and API tests
model: gpt-5.1-codex-mini
temperature: 0.1
skills:
  - api-design
  - rest-graphql-debug
  - test-driven-development
environments:
  - backend
profiles:
  - backend:api
tags:
  - api
  - backend
---
```

### Validation Service

`AgentDefinitionValidatorService`

Checks:

- Agent names unique.
- Referenced skills exist and active.
- Referenced environments/profiles exist.
- No quarantined skill attached by default.
- Tool/MCP references exist when required.

### Candidate Agent Set

Initial agents:

- `api-engineer`
- `database-engineer`
- `frontend-ui-engineer`
- `visual-qa-reviewer`
- `test-automation-engineer`
- `release-engineer`
- `security-reviewer`
- `docs-writer`
- `project-bootstrapper`

### Delegation Prompt Changes

Agent system prompts must include:

- Ownership.
- Expected output shape.
- What not to touch.
- Required verification command.
- How to report files changed.

### Tests

```bash
node --test -r ts-node/register src/modules/agents/**/*.spec.ts
node --test -r ts-node/register src/modules/environments/services/environment-resolver.service.spec.ts
```

Manual:

```bash
npm run build
node dist/main.js
/env use backend --profile api
$api-engineer what files should you own in an Express API task?
```

Expected: direct injected answer, no discovery tool spam.

## Phase 5 Design: Skill and Agent Evals

### New Directory

```text
evals/
  fixtures/
    skill-selection.jsonl
    environment-leaks.jsonl
    mention-injection.jsonl
    project-quality.jsonl
  run-golden-eval.ts
```

### Eval Record Shape

```json
{
  "id": "frontend-react-dashboard",
  "environment": "frontend",
  "profile": "ui-build",
  "prompt": "Build a responsive React dashboard",
  "expectedSkills": ["react-patterns", "frontend-bootstrap"],
  "forbiddenSkills": ["oss-forensics", "docker-management"],
  "expectedAgents": ["frontend"],
  "assertions": {
    "noDiscoveryForDollarMention": true,
    "requiresToolTrace": false
  }
}
```

### Runner Output

```json
{
  "id": "frontend-react-dashboard",
  "status": "pass",
  "expectedSkills": [],
  "actualSkills": [],
  "toolTrace": [],
  "artifactPath": ".cast/evals/..."
}
```

### Services

- `SkillSelectionEvaluator`
- `EnvironmentLeakEvaluator`
- `MentionInjectionEvaluator`
- `OutputRubricEvaluator`
- `EvalArtifactService`

### Commands

```bash
node evals/run-golden-eval.ts --suite skill-selection
node evals/run-golden-eval.ts --suite environment-leaks
```

Optional package scripts:

```json
{
  "eval:skills": "node -r ts-node/register evals/run-golden-eval.ts --suite skill-selection",
  "eval:env": "node -r ts-node/register evals/run-golden-eval.ts --suite environment-leaks"
}
```

## Phase 6 Design: Discovery and CLI UX

### New Search Service

`SkillSearchService`

Inputs:

- query
- active environment
- active profile
- includeQuarantined
- source filter
- risk filter

Outputs:

```ts
interface SkillSearchResult {
  name: string;
  kind: 'skill' | 'agent';
  score: number;
  reason: string;
  description: string;
  source?: string;
  risk?: string;
  environments: string[];
  aliases: string[];
}
```

### Ranking Signals

Priority order:

1. Exact active profile match.
2. Exact active environment match.
3. Exact name.
4. Alias match.
5. Prefix match.
6. Trigger match.
7. Description match.
8. General skill fallback.

Quarantined skills:

- Hidden by default.
- Visible only with explicit `/skills search --include-quarantined`.

### CLI Commands

```text
/skills search <query>
/skills inspect <name>
/skills list --env frontend
/skills list --risk low
/agents list --env backend
/agents inspect api-engineer
```

### SmartInput Changes

- Group suggestions by `Agents` and `Skills`.
- Show type label.
- Show active environment/profile badge.
- Truncate descriptions by terminal width.
- Prefer top 12 results.

### Tests

```bash
node --test -r ts-node/register src/modules/skills/services/skill-search.service.spec.ts
node --test -r ts-node/register src/modules/repl/services/smart-input.spec.ts
node --test -r ts-node/register src/modules/repl/services/repl.service.spec.ts
```

## Phase 7 Design: End-to-End Product Validation

### New Script

```text
scripts/e2e-cast-projects.mjs
```

### Execution Model

The script creates temporary projects under `/tmp/cast-e2e-*`, runs Cast against them, and validates artifacts.

Preferred modes:

1. Deterministic harness mode:
   - Directly exercises internal services.
   - No paid model call required.
   - Fast CI gate.

2. Interactive CLI mode:
   - Runs `node dist/main.js`.
   - Uses scripted input where stable.
   - Stores terminal transcript.

3. Model-backed release mode:
   - Requires `CAST_E2E_MODEL=1`.
   - Runs real prompts through configured model.
   - More expensive, release-only.

### Scenario Contract

```ts
interface E2EScenario {
  id: string;
  environment: string;
  profile?: string;
  prompt: string;
  expectedSkills: string[];
  forbiddenSkills: string[];
  expectedFiles: string[];
  commands: string[];
  graders: string[];
}
```

### Scenario Files

```text
evals/fixtures/e2e/frontend-vite-dashboard.json
evals/fixtures/e2e/backend-express-api.json
evals/fixtures/e2e/qa-regression.json
evals/fixtures/e2e/security-audit.json
evals/fixtures/e2e/devops-worker.json
evals/fixtures/e2e/marketing-brief.json
```

### Artifact Layout

```text
.cast/e2e/<timestamp>/<scenario-id>/
  transcript.log
  tool-trace.jsonl
  environment.json
  skills.json
  files.json
  command-results.json
  grader-report.json
  session-replay.json
```

### Example Scenario: Frontend

Setup:

```bash
tmp=$(mktemp -d /tmp/cast-e2e-frontend-XXXXXX)
cd "$tmp"
npm create vite@latest app -- --template react-ts
cd app
```

Cast run:

```bash
node /path/to/cast-code/dist/main.js
/env use frontend --profile ui-build
Create a responsive task dashboard with filters, keyboard-friendly controls, and tests.
/exit
```

Verification:

```bash
npm install
npm test
npm run build
```

Expected:

- Files created under `src/`.
- Active skills include `react-patterns`, `frontend-bootstrap`, `popular-web-designs`.
- Forbidden skills absent: `oss-forensics`, `docker-management`.

### Example Scenario: Backend

Verification:

```bash
npm install
npm test
npm run build || npm run typecheck
node server.js &
curl -s http://localhost:3000/health
```

Expected:

- API has validation.
- Error responses are structured.
- Tests cover success and failure paths.

### Package Script

```json
{
  "smoke:e2e": "node scripts/e2e-cast-projects.mjs"
}
```

### Release Gate

```bash
npm run typecheck
npm test
npm run build
npm run smoke:schedule
npm run smoke:e2e
npm pack --dry-run
```

## Cross-Cutting Security

- Skill support file access must be read-only.
- Quarantined skills stay hidden from default search.
- E2E scripts must clean temp dirs unless `CAST_E2E_KEEP_ARTIFACTS=1`.
- External network calls are disabled by default in deterministic E2E.
- Any install or model-backed run must be explicit.

## Migration Plan

1. Land Phase 1 behind new tools, no behavior break.
2. Add metadata sidecar and keep heuristic fallback.
3. Introduce profiles while preserving current `/env use <id>`.
4. Add agents incrementally with validation.
5. Add eval scripts, initially non-blocking.
6. Turn discovery UX ranking on by default.
7. Make `smoke:e2e` a release gate.

## Definition of Done

The roadmap is done when:

- Copied Cast packages are usable through `skill_view`.
- Metadata controls skill aliases, risk, environments, and profiles.
- Every environment/profile has tests for expected and forbidden skills.
- Native sub-agents are validated against real skill references.
- Golden evals catch bad injection and environment leakage.
- `$` and `/skills search` are useful with 180+ skills.
- Full E2E project creation suite passes locally and produces inspectable artifacts.
