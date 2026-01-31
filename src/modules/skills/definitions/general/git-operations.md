---
name: git-operations
description: Git version control operations
tools:
  - shell
---

# Git Operations

Capability to perform Git version control operations.

## Common Commands

### Status and Info
- `git status` - See current state
- `git log --oneline -10` - Recent commits
- `git diff` - Unstaged changes
- `git diff --staged` - Staged changes
- `git branch -a` - All branches

### Making Changes
- `git add <file>` - Stage specific file
- `git commit -m "message"` - Commit with message
- `git push` - Push to remote

### Branching
- `git checkout -b <branch>` - Create and switch
- `git checkout <branch>` - Switch branch
- `git merge <branch>` - Merge branch

## Guidelines

### Commit Messages
- Use imperative mood: "Add feature" not "Added feature"
- Keep first line under 50 chars
- Add body for complex changes
- Reference issues when applicable

### Safety
- Never force push to main/master
- Always check status before committing
- Review diff before staging
- Don't commit sensitive data
