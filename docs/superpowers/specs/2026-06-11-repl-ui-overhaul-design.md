# REPL UI Overhaul — Design

**Date:** 2026-06-11
**Status:** Approved by user (sections reviewed incrementally)
**Goal:** Bring the cast REPL experience to Claude Code / Codex level: bordered multiline input, live sub-agent visibility, richer tool-call rendering.

This is sub-project 1 of 4 from the broader "make cast a great CLI" effort. The others (CLI subcommands `cast up`/`cast split-up`, token-efficient agent flow, cross-conversation memory) get their own specs later.

## Scope

1. **Input area**: rounded bordered box, accent `›` label, footer line with mode · model · key hints. Replaces the current full-width background band.
2. **Multiline input**: Ctrl+Enter inserts a newline where the terminal supports the kitty keyboard protocol; Ctrl+J and `\`+Enter work everywhere. Enter submits. Bracketed paste keeps pasted newlines as line breaks instead of submitting.
3. **Live sub-agent tree**: one block per running sub-agent showing name, status spinner, current tool, elapsed time, token count; updates in place; completed agents collapse to a `✓` summary line in scrollback.
4. **Tool-call rendering**: humanized args summary on the call line (`Read src/main.ts`, `Bash npm test`, `Grep "foo" → 14 matches`); Edit/Write completions render colored +/- diff blocks (using the existing `diff` dependency).

Out of scope: Ink/React rewrite, streaming bash tail, result preview lines (declined during clarification), the other three sub-projects.

## Approach decision

Three options were considered:

- **A. Live-region compositor (chosen)** — new rendering layer owning the bottom of the screen; existing key/suggestion logic kept. No new dependencies.
- B. Patch `SmartInput` in place — fastest but stacks a third ad-hoc redraw system onto already fragile cursor math; high regression risk.
- C. Rewrite on Ink — cleanest end state but a heavy new dependency (react+ink), awkward with NestJS DI and the raw `process.stdout.write` remote-broadcast hooks; largest effort.

A chosen because the current `render()` / `clearRenderedBlock()` manual row tracking in `smart-input.ts` is the root cause of redraw fragility; one compositor eliminates that bug class while preserving working input logic.

## Architecture

New layer: `src/ui/live-region/`. It owns the bottom N lines of the terminal ("live region"), repainted as a unit. Everything above is normal scrollback (assistant text, finished tool blocks, diffs) and is never repainted.

```
┌─ scrollback (never repainted) ───────────────┐
│ assistant text, completed tool blocks, diffs │
└──────────────────────────────────────────────┘
┌─ live region (repainted on change) ──────────┐
│ ● architect — ⠹ 24s · 12.3k tk · Read …      │  ← AgentTreeBlock
│ ╭──────────────────────────────────╮         │
│ │ › multiline input here▌          │         │  ← InputBoxBlock
│ ╰──────────────────────────────────╯         │
│   plan · gpt-4.1 · Ctrl+J newline            │  ← FooterBlock
└──────────────────────────────────────────────┘
```

## Components

| Component | File | Responsibility |
|---|---|---|
| `LiveRegionCompositor` | new `src/ui/live-region/compositor.ts` | Single owner of cursor math. Blocks register and return `string[]`. Repaint = clear region, write all block lines, position cursor. `scrollOut(lines)` promotes content into scrollback above the region. One 100ms tick timer while any block is animated; repaints only when dirty. |
| `InputBoxBlock` | new | Renders rounded box + `›` label + wrapped multiline buffer + dim placeholder. Pure function of state. |
| `AgentTreeBlock` | new | Renders sub-agent states (name, spinner, current tool, elapsed, tokens). On completion, emits a `✓ name — done in Xs · Y tk` line via `scrollOut`. |
| `FooterBlock` | new | Mode · model · key hints; replaced by the suggestion list while typing `/`, `@`, or `$`. |
| `MultilineBuffer` | new `src/ui/live-region/multiline-buffer.ts` | Replaces `buffer: string` + `cursor: number` with `lines: string[]` + `(row, col)`. Insert, delete, word ops, newline, cursor navigation across lines. Pure, fully unit-testable. |
| `KeyDecoder` | new | Parses raw stdin bytes into semantic events (`char`, `enter`, `newline`, `paste`, `up`, `down`, `tab`, …). Detects kitty keyboard protocol at startup (emit query, 50ms reply timeout). In raw mode, Enter sends `0x0d` and Ctrl+J sends `0x0a`, so Ctrl+J → `newline` works in every terminal (today's code wrongly treats both as submit). Kitty mode additionally maps Ctrl+Enter (`CSI 13;5u`) → `newline`. `\` + Enter → `newline` everywhere. Enables bracketed paste mode: pasted text arrives as one `paste` event and embedded newlines insert lines instead of submitting. |
| `SmartInput` (slimmed) | changed `src/modules/repl/services/smart-input.ts` | Keeps history, suggestion computation, modes (input/question/choice/passive). Delegates rendering to compositor, key parsing to `KeyDecoder`, buffer to `MultilineBuffer`. The old `buildInputLines` / `clearRenderedBlock` / `cursorRow` math is deleted. |
| `ToolUiService` | changed | Humanized args summary per tool on the call line. Edit/Write completion renders a colored diff block into scrollback. |
| Types | changed `src/ui/cast-design/tool-call.types.ts` | `ToolUiEvent` gains `agentId?` / `agentName?`. `ChatStreamChunk` gains `{ kind: 'agent'; event: AgentUiEvent }` where `AgentUiEvent = spawned \| progress \| completed \| failed` carrying `agentId`, `agentName`, `task`, `tokens?`, `currentTool?`, `durationMs?`, `summary?`, `error?`. DeepAgent/swarm services emit these. |

## Data flow

1. Stdin bytes → `KeyDecoder` → semantic events → `SmartInput` mutates `MultilineBuffer` / suggestions → `compositor.repaint()`.
2. Agent run emits `ChatStreamChunk` (`text | tool | agent`). REPL routing:
   - `text` → streamed to scrollback.
   - `tool` without `agentId` (main agent) → `ToolUiService` → scrollback block; Edit/Write render diffs.
   - `tool` with `agentId` → updates that agent's `currentTool` in `AgentTreeBlock`; no scrollback output.
   - `agent` → `AgentTreeBlock` add/update; `completed`/`failed` removes from tree and scrolls out a summary line.
3. Submit: lines join with `\n`; the input box collapses to a single dim echoed line in scrollback (preserving current submit-echo behavior); history stores the full multiline entry.

## Error handling

- **Kitty detection**: 50ms query timeout; no reply → legacy mode; footer hint shows `Ctrl+J newline` (Ctrl+Enter hint only when kitty mode confirmed). Never blocks startup.
- **Resize**: full repaint with re-wrap. Below 40 columns, box borders are dropped; plain `›` prompt kept.
- **Non-TTY / CI**: compositor disabled; plain append-only line output (generalize the existing `shouldUseInteractiveChoice` check into a global `isInteractive`).
- **Repaint exception**: caught; compositor degrades to append-only mode instead of corrupting the screen.
- **Agent failure**: `failed` event scrolls out a red `✗` line with the first line of the error. A sub-agent that never sends `completed` must not wedge the tree — the run teardown clears remaining entries.

## Testing

- `MultilineBuffer`: pure unit tests — insert, newline, word-delete, cursor navigation across lines, wrapping edge cases.
- `KeyDecoder`: byte-fixture tests → expected event streams, including `CSI 13;5u`, escape sequences split across stdin chunks, kitty-detection timeout path.
- Block renderers: state in → exact `string[]` out at fixed widths (snapshot-style asserts).
- `LiveRegionCompositor`: fake stdout capturing ANSI; assert clear/write/cursor sequences for repaint and `scrollOut`.
- Existing repl specs updated; `npm run smoke:agentic-runtime-v2` validates agent-event plumbing end to end.

## Risks

- Highest-risk seam: replacing SmartInput rendering while keeping question/choice/passive modes working. Mitigation: those modes also become compositor blocks, tested individually.
- Remote broadcast hook (`repl.service.ts` stdout interception) must keep seeing final output. Compositor writes through the same `process.stdout.write`, so interception is unaffected; smoke `/remote` after.
