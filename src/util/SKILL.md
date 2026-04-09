# Util Module

## Does Not Exist

The `src/util/` or `src/utils/` directory does not exist in this codebase.

## Notes

- Utility functions are co-located with their consuming modules rather than centralized.
- The REPL module has a `utils/` subdirectory (`src/modules/repl/utils/`) containing REPL-specific utilities:
  - `theme.ts` — Terminal colors and icons constants
  - `prompts-with-esc.ts` — Escape sequence handling for readline
- Other modules may have their own inline utility functions.

## Why No Central Util Directory?

The project follows a domain-driven structure where utilities live close to the code that uses them. This avoids the "junk drawer" anti-pattern where unrelated utilities accumulate in a shared directory.
