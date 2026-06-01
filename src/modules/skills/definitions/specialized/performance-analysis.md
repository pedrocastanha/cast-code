---
name: performance-analysis
description: Diagnose campaign performance and propose measurable optimization tests
tools:
  - read_file
  - write_file
  - edit_file
  - grep
environments:
  - marketing
---

# Performance Analysis

Use this skill when campaign metrics, funnels, or experiments need diagnosis.

## Analysis Flow

- Define the funnel stage: impression, click, conversion, activation, expansion, or retention.
- Compare current results against baseline, target, and confidence.
- Separate volume problems from conversion problems.
- Propose one test per hypothesis and name the expected metric movement.

## Output Expectations

- Include what changed, why it likely changed, and what evidence is missing.
- Prioritize tests by impact, effort, and risk.
- Avoid optimizing vanity metrics when the business metric is available.
- Ask for spend or publish approval before recommending account mutations.
