---
name: file-operations
description: Read, write, and edit files in the filesystem
tools:
  - read_file
  - write_file
  - edit_file
  - glob
  - ls
---

# File Operations — Domain Knowledge

This skill teaches you how to work with files effectively. Study this to learn patterns, avoid mistakes, and make better decisions.

## Core Principle: Read → Understand → Edit → Verify

Every file operation follows this cycle. NEVER skip steps.

## Tool Mastery

### read_file
- **When**: Before ANY edit, to answer questions, to verify changes
- **Pattern**: Read the whole file first, then specific sections with offset/limit for large files
- **Anti-pattern**: Reading 5 lines of a 500-line file and guessing the rest

### write_file
- **When**: Creating NEW files only. Never for existing files.
- **Anti-pattern**: Using write_file on existing files (overwrites everything — use edit_file)

### edit_file
- **When**: Modifying existing files with precise string replacement
- **Critical**: The `old_string` must be UNIQUE in the file. Include 2-3 surrounding lines for uniqueness.
- **Anti-pattern**: Providing just `const x = 1` when there are 5 similar lines
- **Tip**: Use `replace_all=true` ONLY when renaming across the entire file

### glob
- **When**: Finding files by name pattern. Always the FIRST step in discovery.
- **Key patterns**: `**/*.ts`, `src/**/*.service.ts`, `*.{js,ts,jsx,tsx}`

### ls
- **When**: Quick directory overview, understanding project structure

## Decision Framework

| Situation | Tool | Why |
|-----------|------|-----|
| What's in this file? | read_file | Direct content access |
| Find all test files | glob `**/*.test.ts` | Pattern matching |
| Fix this line | read_file → edit_file | Must read first |
| Create a new util | write_file | New file creation |
| Find where X is defined | glob → grep → read_file | Progressive narrowing |

## Common Mistakes

1. **Editing without reading** — You WILL get the old_string wrong
2. **Assuming file structure** — Always verify with ls or glob first
3. **Overwriting with write_file** — Use edit_file for existing files
4. **Non-unique old_string** — Add more context lines to make it unique
5. **Not verifying after edit** — Always re-read to confirm changes
