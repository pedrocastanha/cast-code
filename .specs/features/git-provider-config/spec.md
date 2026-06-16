# Azure DevOps Provider Configuration Specification

> Status: Draft for approval · Owner: @pedrocastanha · Created: 2026-06-16
> Feature slug: `git-provider-config`

## Problem Statement

`/pr` and `/branch-split` can only open pull requests on **GitHub** today — that path already works
without any configuration (provider detected from the git remote, `gh` handles auth). For **Azure
DevOps** repos, `pr-generator.service.ts` returns `platform: 'azure'` as *not supported* and nothing
gets created. There is also no place to store the Azure-specific data a PR needs (PAT, organization,
project). We need an **Azure DevOps configuration** in `/settings`, and the PR commands must pick the
right provider at creation time — auto-detected from the repo's remote, asking only when unclear.

GitHub stays exactly as it is. This feature **adds** Azure support; it does not change GitHub behaviour.

## Goals

- [ ] `/settings` gains an "Azure DevOps" configuration entry that stores the PAT and the fields Azure PR creation needs.
- [ ] At PR-open time, `/pr` and `/branch-split` resolve the provider from the git remote (GitHub vs Azure), and only **ask** the user when detection is ambiguous.
- [ ] Azure DevOps PR creation works end-to-end via PAT (today it returns "not supported").
- [ ] GitHub flow is byte-for-byte unchanged when the remote is GitHub.

## Decisions Locked (from discuss)

| Topic | Decision |
| ----- | -------- |
| GitHub | **No config, unchanged.** Provider auto-detected, `gh` handles auth, current `/pr` + `/branch-split` GitHub flow untouched. |
| Azure config scope | **Hybrid.** Global (`~/.cast/config.yaml`): PAT, organization URL, project, default reviewers. Per-repo (`.cast/config.yaml`): repository name + target branch overrides. Per-repo wins. |
| Auth | **PAT.** Azure PAT required, passed to `az` via `AZURE_DEVOPS_EXT_PAT` env var. Never logged; masked on display. |
| Provider choice | **Detected from git remote.** `github.com` → GitHub; `dev.azure.com`/`visualstudio.com` → Azure. Prompt "GitHub / Azure" **only** when the remote is ambiguous/unknown or the user overrides. |
| PR template | **Embedded only.** Remove the hardcoded `Downloads/...md` path (it would also break Azure PR bodies, since the body path is shared). |

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Any GitHub config in `/settings` | GitHub works without it; explicitly kept as-is. |
| GitLab / Bitbucket PR creation | Not requested; detection already returns them as unsupported. |
| Encrypting the PAT / OS keychain | Matches existing plaintext `remote.password`/`platform.apiKey`; separate security task. |
| Auto-creating a missing target branch | Validate + error; creation is the user's job. |

---

## User Stories

### P1: Configure Azure DevOps in /settings ⭐ MVP

**User Story**: As a developer on an Azure DevOps repo, I want an "Azure DevOps" entry in `/settings` so I can store the PAT, organization, and project that PR creation needs.

**Why P1**: Azure PR creation cannot work without these values; it is the feature's foundation.

**Acceptance Criteria**:

1. WHEN the user opens the settings menu THEN the system SHALL show a "Configure Azure DevOps" entry.
2. WHEN the user selects it THEN the system SHALL prompt for: PAT (required), organization URL, project, optional repository (default derived from remote), optional target branch, optional required-reviewers.
3. WHEN the user saves THEN global fields (PAT, org, project, reviewers) SHALL go to `~/.cast/config.yaml` under `azureDevops`, and per-repo fields (repository, targetBranch) to `.cast/config.yaml` in the repo root.
4. WHEN PAT or organization URL or project is blank THEN the system SHALL block save with a clear message naming the missing field.
5. WHEN the config is viewed THEN the PAT SHALL be masked (e.g. `••••1234`).
6. WHEN `.cast/config.yaml` is written THEN `.cast/` SHALL be added to `.gitignore` (consistent with `.branches/`).

**Independent Test**: Run `/settings` → Configure Azure DevOps → fill PAT/org/project → inspect both YAML files; PAT masked in the view screen.

---

### P1: Provider resolution at PR-open time ⭐ MVP

**User Story**: As a developer, I want `/pr` to open the PR on the correct provider automatically, based on my repo's remote.

**Why P1**: Without correct routing, Azure config is never used and GitHub could be disturbed.

**Acceptance Criteria**:

1. WHEN the remote host is `github.com` THEN `/pr` SHALL run the **existing** GitHub flow with no change and no provider prompt.
2. WHEN the remote host is `dev.azure.com` or `visualstudio.com` THEN `/pr` SHALL run the Azure flow.
3. WHEN the remote is unknown/ambiguous (or the user passes an override flag) THEN the system SHALL prompt "Open PR on: GitHub / Azure / No".
4. WHEN the Azure flow is selected but no Azure config exists THEN the system SHALL stop and point the user to `/settings`.
5. WHEN "No" is chosen THEN the system SHALL fall back to the existing copy-description behaviour, making no remote call.

**Independent Test**: On a GitHub remote, `/pr` behaves identically to today (no new prompt). On an Azure remote, `/pr` enters the Azure flow.

---

### P1: Azure DevOps PR creation via PAT ⭐ MVP

**User Story**: As a developer, I want `/pr` to actually create the PR on Azure DevOps with the embedded description.

**Why P1**: This is the missing capability the whole feature exists to add.

**Acceptance Criteria**:

1. WHEN the Azure flow runs THEN the PR SHALL be created via `az repos pr create` with `--organization`, `--project`, `--repository`, `--source-branch` (current), `--target-branch` (config or repo default), `--title`, `--description` (embedded template body).
2. WHEN the PAT is supplied THEN it SHALL be passed to `az` via the `AZURE_DEVOPS_EXT_PAT` environment variable, never on the command line.
3. WHEN required-reviewers are configured THEN they SHALL be passed via `--required-reviewers`.
4. WHEN the `az` CLI is absent THEN the system SHALL report it (mirroring the `which gh` check) and fall back to showing the description.
5. WHEN `az` returns an error THEN the message SHALL surface verbatim, not be swallowed.
6. WHEN the PR is created THEN its URL SHALL be printed (parsed from `az` output).

**Independent Test**: On a configured Azure repo with a feature branch, `/pr` → choose/auto Azure → PR opens against the configured target and the URL prints.

---

### P2: `/branch-split` multi-provider + Azure stack

**User Story**: As a developer, I want `/branch-split` to open its stacked PRs on the detected provider, including Azure.

**Why P2**: High value, builds on P1 resolution + Azure plumbing.

**Acceptance Criteria**:

1. WHEN the provider resolves to GitHub THEN `/branch-split` SHALL open the stack exactly as today.
2. WHEN the provider resolves to Azure THEN each stacked PR SHALL be created via Azure with the correct `--source-branch`/`--target-branch` (stacked bases preserved) and PAT via env var.
3. WHEN Azure is chosen but config is missing THEN the system SHALL stop and point to `/settings`, keeping the `.branches/` docs.

**Independent Test**: On an Azure repo, run `/branch-split` on a >300-line branch → stacked PRs open on Azure with correct chained targets.

---

### P3: First-run wizard offers Azure step

**User Story**: As a new user, I want the setup wizard to optionally configure Azure DevOps so I don't have to find it later.

**Why P3**: Convenience; the standalone `/settings` entry already covers the need.

**Acceptance Criteria**:

1. WHEN the full setup wizard runs THEN it SHALL offer an optional, skippable "Configure Azure DevOps" step.

---

## Edge Cases

- WHEN no Azure config exists and the remote is GitHub THEN behaviour is unchanged (most common path).
- WHEN the configured `targetBranch` does not exist THEN the system SHALL error clearly and not open a PR.
- WHEN both global and per-repo Azure config define a field THEN the per-repo value SHALL win.
- WHEN the Azure PAT is invalid/expired THEN the `az` error SHALL surface verbatim.
- WHEN the PAT is rendered anywhere (view/log/preview) THEN it SHALL be masked.
- WHEN the remote is GitLab/Bitbucket THEN the system SHALL keep the current "not supported, here's the description" behaviour.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AZ-01 | P1: `/settings` Azure entry + prompts | Design | Pending |
| AZ-02 | P1: Hybrid global + per-repo persistence | Design | Pending |
| AZ-03 | P1: Required-field validation on save | Design | Pending |
| AZ-04 | P1: PAT masking on display | Design | Pending |
| AZ-05 | P1: `.cast/` gitignored | Design | Pending |
| AZ-06 | P1: Provider resolution from remote | Design | Pending |
| AZ-07 | P1: Prompt only when ambiguous/override | Design | Pending |
| AZ-08 | P1: Missing-Azure-config guard → /settings | Design | Pending |
| AZ-09 | P1: Azure PR creation via `az` + PAT env var | Design | Pending |
| AZ-10 | P1: Surface `az` errors + URL parse | Design | Pending |
| AZ-11 | P1: Remove hardcoded template path → embedded | Design | Pending |
| AZ-12 | P2: branch-split Azure stack | Design | Pending |
| AZ-13 | P3: setup wizard step | - | Pending |

**Coverage:** 13 total, 0 mapped to tasks (Design pending).

---

## Proposed Config Shape (for Design phase — not final)

```yaml
# ~/.cast/config.yaml  (global) — Azure only; GitHub needs nothing
azureDevops:
  pat: xxxxxxxx                              # required; sent via AZURE_DEVOPS_EXT_PAT
  organizationUrl: https://dev.azure.com/myorg   # required
  project: MyProject                         # required
  reviewers: [user@org.com]                  # optional

# <repo>/.cast/config.yaml  (per-repo, overrides global)
azureDevops:
  repository: my-repo        # optional; default derived from remote
  targetBranch: main         # optional; default = Azure repo default branch
```

### Fields the user fills — summary (Azure only)

| Field | Scope | Required | Maps to |
| ----- | ----- | -------- | ------- |
| PAT | global | yes | `AZURE_DEVOPS_EXT_PAT` env var |
| Organization URL | global | yes | `--organization` |
| Project | global | yes | `--project` |
| Required reviewers | global | no | `--required-reviewers` |
| Repository | per-repo | no | `--repository` (default from remote) |
| Target branch | per-repo | no | `--target-branch` (default = repo default) |

GitHub: **nothing to fill** — detected + `gh` auth, as today.

---

## Success Criteria

- [ ] A GitHub-remote user sees zero change in `/pr` and `/branch-split`.
- [ ] An Azure-remote user configures once and `/pr` + `/branch-split` open PRs on Azure with the embedded description against the right target.
- [ ] No machine-local absolute path remains in `pr-generator.service.ts`.
- [ ] PAT never appears unmasked in any view/log.

---

## Notes / References

- Provider detection already exists: `detectPlatform()` returns `github | azure | gitlab | bitbucket | unknown` from the remote URL — reuse it.
- `az repos pr create`: `--repository`, `--source-branch`, `--target-branch` (defaults to repo default), `--title` (required), `--description`, `--required-reviewers`, `--organization`, `--project`; PAT via `AZURE_DEVOPS_EXT_PAT`. ([az repos pr](https://learn.microsoft.com/en-us/cli/azure/repos/pr?view=azure-cli-latest))
- GitHub create flags unchanged: `gh pr create --base --head --title --body-file`. ([gh manual](https://cli.github.com/manual/gh_pr_create))

### Current code touchpoints (for Design)

- `src/modules/git/services/pr-generator.service.ts` — delete `prTemplatePath`; add Azure creation branch; keep GitHub path intact; reuse `detectPlatform()`.
- `src/modules/git/services/branch-split.service.ts` — `createPullRequests` gains Azure path.
- `src/modules/repl/services/commands/git-commands.service.ts` — `cmdPr` / `cmdBranchSplit` provider resolution (detect → flow; prompt only if ambiguous).
- `src/modules/config/types/config.types.ts` — add `AzureDevopsConfig` + `azureDevops?` on `CastConfig`.
- `src/modules/config/services/config-manager.service.ts` — load/merge global + per-repo `.cast/config.yaml`, `setAzureConfig`, masking, `.cast/` gitignore.
- `src/modules/config/services/config-commands.service.ts` — new "Configure Azure DevOps" menu entry + prompts.
- `src/modules/config/services/init-config.service.ts` — optional wizard step (P3).
