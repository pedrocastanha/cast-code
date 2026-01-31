---
name: search
description: Search for patterns and content in the codebase
tools:
  - grep
  - glob
---

# Search

Capability to search the codebase for patterns and content.

## Available Operations
- **grep**: Search file contents with regex
- **glob**: Find files by name pattern

## Search Strategies

### Finding Definitions
- Class: `class ClassName`
- Function: `function functionName` or `const functionName =`
- Interface: `interface InterfaceName`
- Type: `type TypeName`

### Finding Usage
- Imports: `import.*ClassName`
- Calls: `functionName\(`
- References: just the name

### Common Patterns
- Find all exports: `export (const|function|class|interface)`
- Find TODOs: `TODO|FIXME|HACK`
- Find console logs: `console\.(log|error|warn)`

## Guidelines
- Start broad, then narrow down
- Use case-insensitive when unsure
- Limit results to manageable amount
- Search in specific directories when possible
