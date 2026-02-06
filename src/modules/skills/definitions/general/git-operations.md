---
name: git-operations
description: Git version control operations
tools:
  - shell
---

# Git Operations — Domain Knowledge

This skill teaches you how to work with Git safely and effectively. Study this to learn safe workflows, commit conventions, and recovery techniques.

## Core Principle: Check → Stage → Commit → Verify

Always know the state before changing it.

## Safe Workflow

```
1. git status                    # What's the current state?
2. git diff                      # What exactly changed?
3. git add <specific files>      # Stage only what's needed
4. git diff --staged             # Verify what's being committed
5. git commit -m "clear message" # Commit with intent
6. git status                    # Verify clean state
```

## Commit Message Convention

Types: feat, fix, refactor, docs, test, chore, style, perf
Rule: First line < 50 chars, imperative mood ("Add feature" not "Added feature")

## DANGER ZONE — Commands That Need User Confirmation

| Command | Risk |
|---------|------|
| `git push --force` | Overwrites remote history |
| `git reset --hard` | Destroys local changes |
| `git clean -f` | Deletes untracked files |
| `git branch -D` | Force-deletes a branch |
| `git checkout .` | Discards all unstaged changes |

## Safe Commands (No Confirmation Needed)

- `git status`, `git log`, `git diff`, `git branch`
- `git add <specific_file>` (not `git add -A`)
- `git commit -m "message"` (with proper message)
- `git stash` / `git stash pop`
- `git fetch`

## Recovery Techniques

| Problem | Solution |
|---------|----------|
| Wrong commit message | `git commit --amend` (if not pushed) |
| Committed wrong file | `git reset HEAD~1` (soft) → re-stage |
| Need to undo last commit | `git reset --soft HEAD~1` |
| Accidentally deleted file | `git checkout -- <file>` |
| Find when bug introduced | `git bisect start` |
| See who changed a line | `git blame <file>` |
