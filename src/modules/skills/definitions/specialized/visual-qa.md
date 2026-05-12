---
name: visual-qa
description: Inspect UI output for layout, responsiveness, accessibility, and screenshot regressions
tools:
  - read_file
  - write_file
  - edit_file
  - shell
environments:
  - design
---

# Visual QA

Use this skill before calling a UI implementation complete.

## Checks

- Desktop and mobile viewports render without overlaps, clipped labels, or layout jumps.
- Buttons, form controls, tabs, and menus have visible hover/focus/disabled states.
- Text sizing matches context: compact panels use compact type, heroes use display type.
- Color contrast and disabled states remain readable.

## Verification

- Run the project UI smoke or screenshot command when available.
- Inspect screenshots for actual rendered content, not only successful HTTP status.
- For canvas or 3D surfaces, verify nonblank pixels and correct framing.
- Document any residual visual risk if screenshots cannot run locally.
