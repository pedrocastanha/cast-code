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

# File Operations

Capability to manipulate files in the project filesystem.

## Available Operations
- **read_file**: Read file contents with optional line range
- **write_file**: Create or overwrite files
- **edit_file**: Replace specific strings in files
- **glob**: Find files matching patterns
- **ls**: List directory contents

## Guidelines

### Before Editing
- Always read the file first
- Understand the existing structure
- Identify the exact location to modify

### When Editing
- Preserve original indentation (tabs vs spaces)
- Match existing code style
- Make minimal changes
- Don't add unnecessary whitespace

### File Patterns
- Use `**/*.ts` for recursive TypeScript files
- Use `src/**/*` for all files in src
- Use `*.{js,ts}` for multiple extensions
