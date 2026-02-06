---
name: planning
description: Task planning and decomposition
tools:
  - read_file
  - glob
  - enter_plan_mode
  - exit_plan_mode
  - task_create
  - task_update
---

# Planning — Domain Knowledge

This skill teaches you how to plan complex work before executing it. Study this to learn when to plan, how to decompose tasks, and how to create actionable plans.

## Core Principle: Think Before You Act

The time you spend planning saves 5x the time you'd waste fixing mistakes.

## When to Plan (Decision Framework)

| Situation | Plan needed? | Why |
|-----------|-------------|-----|
| Fix a typo | No | Single, obvious change |
| Add a function to existing file | No | Clear scope |
| Add a new feature (3+ files) | **YES** | Multiple touchpoints |
| Refactor a module | **YES** | Ripple effects |
| Change an API contract | **YES** | Breaking changes possible |
| Debug a complex bug | Maybe | Investigate first, plan the fix |
| User says "implement X" where X is vague | **YES** | Need to clarify scope |

## Planning Process

### Phase 1: Discovery (BEFORE plan_mode)
1. `glob` to understand project structure
2. `read_file` key files (entry points, configs, relevant modules)
3. `grep` to find related code and patterns
4. Identify ALL files that will be touched

### Phase 2: Plan (IN plan_mode)
1. `enter_plan_mode` — signals you're planning, not executing
2. List every file to create/modify with specific changes
3. Order by dependency (don't modify callers before callees)
4. Identify risks and edge cases
5. Define verification steps
6. `exit_plan_mode` — present plan for user approval

### Phase 3: Execute (AFTER approval)
1. Create tasks with `task_create` for each step
2. Execute sequentially, marking tasks complete
3. Verify after each step
4. Run tests at the end

## Plan Template

```markdown
## Goal
[What we're achieving]

## Changes
1. **file1.ts** — [what changes and why]
2. **file2.ts** — [what changes and why]

## Order of Operations
1. First: [foundation changes]
2. Then: [dependent changes]
3. Finally: [verification]

## Risks
- [What could go wrong and mitigation]
```

## Task Decomposition Rules

### Good tasks are:
- **Specific**: "Add validateEmail function to utils/validation.ts"
- **Independent**: Can be verified in isolation when possible
- **Small**: 1-2 file changes per task
- **Ordered**: Dependencies are explicit

### Anti-patterns:
- "Implement everything" (too vague)
- "Fix the code" (what code? what fix?)
- Tasks that can't be verified
- Skipping the planning step for complex work
