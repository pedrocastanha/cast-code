# Azure DevOps Provider Configuration — Tasks

**Design**: `.specs/features/git-provider-config/design.md`
**Status**: In Progress

Gate commands (repo convention — no TESTING.md):
- **quick**: `npm test -- <spec glob>` (`node --test -r ts-node/register`)
- **build**: `npm run typecheck`

---

## Execution Plan

```
Phase 1 (Foundation):      T1
Phase 2 (Core, parallel):  T1 → { T2, T3, T4 }
Phase 3 (Settings UI):     T2 → T5
Phase 4 (Commands):        {T2,T3,T4} → T6 → T7
Phase 5 (Wizard, P3):      T5 → T8
```

```
T1 ──┬──→ T2 ─────────→ T5 ─────→ T8
     ├──→ T3 ──┐
     └──→ T4 ──┼──→ T6 ──→ T7
        T2 ────┘
```

---

## Task Breakdown

### T1: Add Azure config types
**What**: Add `AzureDevopsGlobalConfig`, `AzureDevopsRepoConfig`, `ResolvedAzureConfig`, and `azureDevops?` on `CastConfig`.
**Where**: `src/modules/config/types/config.types.ts`
**Depends on**: None
**Reuses**: existing `RemoteConfig`/`PlatformGlobalConfig` shape
**Requirement**: AZ-02
**Done when**:
- [ ] Interfaces exported with fields from design
- [ ] `npm run typecheck` passes
**Tests**: none (type-only) · **Gate**: build
**Commit**: `feat(config): add Azure DevOps config types`

---

### T2: ConfigManager Azure read/merge/save + masking [P]
**What**: `getAzureConfig(cwd)` (merge global + per-repo `.cast/config.yaml`, per-repo wins), `setAzureGlobalConfig`, `setAzureRepoConfig` (+ ensure `.cast/` gitignored), `maskSecret`.
**Where**: `src/modules/config/services/config-manager.service.ts` (+ `config-manager.service.spec.ts` new)
**Depends on**: T1
**Reuses**: `mergeWithDefaults`, `normalizePlatformConfig`, `saveConfig`, `js-yaml`
**Requirement**: AZ-02, AZ-03, AZ-04, AZ-05
**Done when**:
- [ ] Per-repo overrides global in merge
- [ ] `maskSecret('abcd1234')` → `••••1234`
- [ ] `setAzureRepoConfig` creates `.cast/config.yaml` + adds `.cast/` to `.gitignore`
- [ ] quick gate passes; ≥4 new tests pass
**Tests**: unit · **Gate**: quick
**Commit**: `feat(config): persist and merge Azure DevOps config`

---

### T3: AzureDevopsService (az wrapper + remote parse) [P]
**What**: New service: `parseAzureRemote`, `isAzAvailable`, `createPr`, `createStackedPrs`. Register in `git.module.ts`.
**Where**: `src/modules/git/services/azure-devops.service.ts` (+ `.spec.ts`), `src/modules/git/git.module.ts`
**Depends on**: T1
**Reuses**: error/URL-parse style from `pr-generator.createPR`; stack loop from `branch-split.createPullRequests`
**Requirement**: AZ-09, AZ-10
**Done when**:
- [ ] `parseAzureRemote` handles dev.azure.com HTTPS, ssh v3, `*.visualstudio.com`
- [ ] `createPr` builds `az repos pr create` args; PAT only via `AZURE_DEVOPS_EXT_PAT` env (asserted in test via injected runner)
- [ ] service exported from GitModule
- [ ] quick gate passes; ≥5 new tests pass
**Tests**: unit · **Gate**: quick
**Commit**: `feat(git): add Azure DevOps PR service`

---

### T4: Embedded-only PR template [P]
**What**: Delete `prTemplatePath` + filesystem read; `getPRTemplate()` returns the embedded `buildDefaultTemplate()`.
**Where**: `src/modules/git/services/pr-generator.service.ts`
**Depends on**: T1 (none functionally; ordered for clean commits)
**Reuses**: `buildDefaultTemplate`, `normalizeTemplate`
**Requirement**: AZ-11
**Done when**:
- [ ] No machine-local absolute path remains in the file
- [ ] Existing `pr-generator.service.spec.ts` passes
- [ ] quick gate passes
**Tests**: unit · **Gate**: quick
**Commit**: `fix(git): use embedded PR template, drop hardcoded path`

---

### T5: Settings entry "Configure Azure DevOps"
**What**: `setAzureInteractive()`, menu `case 'a'`, masked Azure section in `showConfig`.
**Where**: `src/modules/config/services/config-commands.service.ts`
**Depends on**: T2
**Reuses**: `setRemoteInteractive` pattern, `inputWithEsc`/`confirmWithEsc`, `runInquirerFlow`, `header`
**Requirement**: AZ-01, AZ-03, AZ-04
**Done when**:
- [ ] Menu shows "Configure Azure DevOps"
- [ ] Required-field validation (pat/org/project) blocks save
- [ ] `showConfig` renders PAT masked
- [ ] `npm run typecheck` passes
**Tests**: none (interactive UI; logic covered in T2) · **Gate**: build
**Commit**: `feat(config): Azure DevOps settings menu`

---

### T6: `/pr` provider resolution + Azure flow
**What**: `resolveProvider()` helper; in `cmdPr`, after body gen, branch to existing GitHub block or new Azure block (guard missing config → /settings).
**Where**: `src/modules/repl/services/commands/git-commands.service.ts` (+ update `git-commands.service.spec.ts`)
**Depends on**: T2, T3, T4
**Reuses**: `prGenerator.detectPlatform()`, `generatePRDescription`, `askChoice`
**Requirement**: AZ-06, AZ-07, AZ-08, AZ-09
**Done when**:
- [ ] GitHub remote → unchanged flow, no new prompt
- [ ] Azure remote → Azure create; missing config → guidance message
- [ ] unknown remote → GitHub/Azure/No prompt
- [ ] quick gate passes (git-commands spec); no test count regression
**Tests**: unit · **Gate**: quick
**Commit**: `feat(git): route /pr to GitHub or Azure by remote`

---

### T7: `/branch-split` provider resolution + Azure stack
**What**: Provider-aware open step in `cmdBranchSplit` / `runBranchSplitCreate`; Azure stack via `AzureDevopsService.createStackedPrs`.
**Where**: `src/modules/repl/services/commands/git-commands.service.ts`, `src/modules/git/services/branch-split.service.ts`
**Depends on**: T3, T6
**Reuses**: existing GitHub `createPullRequests`; `resolveProvider` from T6
**Requirement**: AZ-12
**Done when**:
- [ ] GitHub path unchanged
- [ ] Azure path opens stacked PRs with chained targets
- [ ] missing Azure config keeps `.branches/` and points to /settings
- [ ] quick gate passes (branch-split spec)
**Tests**: unit · **Gate**: quick
**Commit**: `feat(git): route /branch-split stack to GitHub or Azure`

---

### T8: Wizard Azure step (P3)
**What**: Optional, skippable Azure step in `runInitialSetup`.
**Where**: `src/modules/config/services/init-config.service.ts`
**Depends on**: T5
**Reuses**: shared `setAzureInteractive` logic
**Requirement**: AZ-13
**Done when**:
- [ ] Wizard offers and can skip the Azure step
- [ ] `npm run typecheck` passes
**Tests**: none (interactive) · **Gate**: build
**Commit**: `feat(config): optional Azure step in setup wizard`

---

## Validation Tables

### Granularity
| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 file, types | ✅ |
| T2 | 1 service, cohesive methods | ✅ |
| T3 | 1 new service | ✅ |
| T4 | 1 method cleanup | ✅ |
| T5 | 1 UI flow | ✅ |
| T6 | 1 command method | ✅ |
| T7 | 1 command flow (2 files, cohesive) | ✅ |
| T8 | 1 wizard step | ✅ |

### Diagram ↔ Definition Cross-Check
| Task | Depends on (body) | Diagram | Status |
| ---- | ----------------- | ------- | ------ |
| T1 | none | root | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T1 | T1→T3 | ✅ |
| T4 | T1 | T1→T4 | ✅ |
| T5 | T2 | T2→T5 | ✅ |
| T6 | T2,T3,T4 | →T6 | ✅ |
| T7 | T3,T6 | T6→T7 | ✅ |
| T8 | T5 | T5→T8 | ✅ |

### Test Co-location
| Task | Layer | Convention | Task says | Status |
| ---- | ----- | ---------- | --------- | ------ |
| T1 | types | none | none | ✅ |
| T2 | service logic | unit | unit | ✅ |
| T3 | service logic | unit | unit | ✅ |
| T4 | service logic | unit (existing spec) | unit | ✅ |
| T5 | interactive UI | none | none | ✅ |
| T6 | command logic | unit (existing spec) | unit | ✅ |
| T7 | command logic | unit | unit | ✅ |
| T8 | interactive UI | none | none | ✅ |
