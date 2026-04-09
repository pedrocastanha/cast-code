# Shared Module

## Does Not Exist

The `src/shared/` directory does not exist in this codebase.

## Notes

- The codebase uses `src/common/` for shared infrastructure (LLM factory, markdown parsing, global config).
- If you're looking for shared types, utilities, or constants, check `src/common/` instead.
- The `common/` directory is marked as `@Global()` in NestJS, providing application-wide access to its services.

## Why No Shared Directory?

The project architecture uses `common/` as the shared layer rather than `shared/`. This is a naming convention choice — `common/` is the NestJS-typical name for cross-cutting infrastructure.
