---
name: code-review
description: Review changes for behavioral regressions, risk, missing tests, and integration issues
tools:
  - read_file
  - grep
  - glob
  - shell
environments:
  - engineering
---

# Code Review

Use this skill when reviewing a diff, PR, or branch before merge.

## Review Stance

- Lead with concrete bugs, regressions, security issues, data-loss risks, and missing tests.
- Ground every finding in a file and behavior. Avoid style-only feedback unless it hides risk.
- Check call sites, migrations, API contracts, auth boundaries, and async error paths.
- Verify tests cover the changed behavior, not just the happy path.

## Output Shape

- Findings first, ordered by severity.
- Include file references and explain the failure mode.
- Add open questions only when they change the implementation decision.
- If no issues are found, say that directly and name remaining test gaps.
