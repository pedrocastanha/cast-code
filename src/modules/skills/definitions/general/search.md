---
name: search
description: Search for patterns and content in the codebase
tools:
  - grep
  - glob
---

# Search — Domain Knowledge

This skill teaches you how to find anything in a codebase efficiently. Study this to learn search strategies and progressive narrowing techniques.

## Core Principle: Broad → Narrow → Precise

Never start with a narrow search. Cast a wide net first, then refine.

## Search Strategy Matrix

| I need to find... | First try | Fallback |
|-------------------|-----------|----------|
| A file by name | `glob **/*filename*` | `glob **/*.ext` |
| A function definition | `grep "function name\|const name"` | Per-file type search |
| Where X is used | `grep "X"` files_with_matches | `grep "import.*X"` |
| A config value | `glob **/*.{json,yaml,toml,env}` | `grep "KEY_NAME"` |
| Dead code | `grep "export.*FuncName"` then `grep "FuncName"` (compare counts) | |

## Regex Patterns Every Developer Needs

### Finding Definitions
- `class\s+ClassName` — Class definition
- `function\s+funcName` — Function declaration
- `const\s+funcName\s*=` — Arrow function
- `interface\s+InterfaceName` — TypeScript interface
- `export\s+(default\s+)?` — Exports

### Finding Usage
- `import.*{.*Name.*}.*from` — Named imports
- `new\s+ClassName` — Instantiation
- `Name\(` — Function calls

### Finding Problems
- `TODO|FIXME|HACK|XXX` — Developer notes
- `console\.(log|error|warn)` — Debug output
- `\.catch\(\s*\)` — Empty catch blocks

## Progressive Narrowing Technique

1. **Discover**: `glob "**/*.ts"` → understand the file landscape
2. **Locate**: `grep "pattern"` with `output_mode=files_with_matches` → find candidate files
3. **Context**: `grep "pattern"` with `context_lines=5` on specific files → see surrounding code
4. **Read**: `read_file` the most promising candidates → full understanding

## Common Mistakes

1. **Too specific too early** — Search for parts of the string, not the exact thing
2. **Wrong file types** — Search `.ts` AND `.tsx` and `.js`
3. **Case sensitivity** — Always consider case-insensitive first
4. **Giving up after one miss** — Try synonyms, partial matches, different patterns
5. **Not using context_lines** — A match without context is often useless
