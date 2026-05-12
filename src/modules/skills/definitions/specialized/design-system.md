---
name: design-system
description: Translate product design into tokens, primitives, variants, and reusable UI contracts
tools:
  - read_file
  - write_file
  - edit_file
  - grep
  - glob
  - ls
environments:
  - design
  - engineering
---

# Design Systems

Use this skill when implementing or reviewing UI that should align with a design system.

## Implementation Layers

- Tokens: color, typography, radius, spacing, elevation, motion, and breakpoints.
- Primitives: button, input, select, tabs, table, modal, toast, badge, and tooltip.
- Variants: size, intent, density, disabled, loading, selected, and error states.
- Composition: page-level layouts should use primitives instead of one-off styles.

## Quality Bar

- Keep dimensions stable so hover, labels, icons, and dynamic text do not shift layout.
- Validate keyboard, focus, contrast, and screen-reader states for interactive controls.
- Prefer existing project components and tokens over creating a parallel system.
- Verify important screens with screenshots when visual regressions are possible.
