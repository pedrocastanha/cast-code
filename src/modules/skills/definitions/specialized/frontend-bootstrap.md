---
name: frontend-bootstrap
description: Bootstrap full frontend projects from Figma and product requirements
tools:
  - read_file
  - write_file
  - edit_file
  - glob
  - grep
  - ls
  - shell
---

# Frontend Bootstrap from Figma

Use this skill when the goal is to turn a prototype into a complete frontend foundation quickly.

## Outcome Targets

- Deliver a runnable frontend scaffold with routing, layout, and core pages.
- Generate reusable UI primitives before page-specific components.
- Apply consistent styling through design tokens and theme variables.
- Keep architecture ready for backend integration.

## Figma-to-Code Workflow

1. Map screens and flows:
- Identify all top-level screens in the prototype.
- Capture navigation structure and page hierarchy.
- Note critical interaction states (loading, empty, error, success).

2. Extract design system:
- Color palette, typography scale, spacing scale, border radius, shadow set.
- Component variants for button, input, select, table, modal, card, badge, tabs.
- Breakpoints and responsive behavior.

3. Plan project structure:
- `src/app` or `src/pages` for routes/screens.
- `src/components/ui` for primitives.
- `src/components/features` for domain components.
- `src/styles` for tokens/theme/global styles.
- `src/lib` for utilities and configuration.

4. Generate in layers:
- First: tokens/theme + base layout + routes.
- Second: UI primitives and variants.
- Third: screen composition using primitives.
- Fourth: stubs for API services and typed contracts.

5. Validate consistency:
- Verify token usage over hardcoded values.
- Verify responsive layout across mobile/tablet/desktop.
- Verify accessibility basics: semantic roles, labels, focus, contrast.

## Heuristics for Common Elements

- Table-heavy screens:
  - Create reusable `DataTable` with column config, pagination, loading and empty states.
- Form-heavy screens:
  - Create form field wrappers with validation message and helper text support.
- Modal-heavy flows:
  - Standardize modal shell, close behavior, keyboard handling, and action footer.
- Dashboard screens:
  - Prioritize layout grid and card primitives before chart wiring.

## Integration Readiness

- Keep API and data fetching behind dedicated service/hooks layers.
- Use mock data adapters initially to unblock UI.
- Preserve clear boundaries so backend integration only replaces adapters and endpoints.

