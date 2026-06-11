# REPL UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the cast REPL to Claude Code level: bordered multiline input box, Ctrl+Enter/Ctrl+J/`\`+Enter newlines, live sub-agent tree, colored diffs for file edits.

**Architecture:** New `src/ui/live-region/` layer — a `LiveRegionCompositor` owns the bottom of the terminal and repaints registered blocks (agent tree, input box, footer) as one unit; scrollback above is append-only. `SmartInput` keeps history/suggestions/modes but delegates key parsing to `KeyDecoder`, buffer state to `MultilineBuffer`, and rendering to the compositor.

**Tech Stack:** TypeScript, Node ≥20, `node:test` + `assert/strict` (colocated `.spec.ts`), existing `diff` dependency. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-11-repl-ui-overhaul-design.md`

> **Note:** The user has requested no commits this session. Commit steps below are standard practice — get explicit user approval before running them, or skip.

**Verification commands used throughout:**
- Single test file: `node --test -r ts-node/register src/ui/live-region/multiline-buffer.spec.ts`
- All tests: `npm test`
- Types: `npm run typecheck`
- Lint: `npm run lint:check`

---

### Task 1: Stream/agent event types

**Files:**
- Modify: `src/ui/cast-design/tool-call.types.ts`

No test (type-only change); `npm run typecheck` is the verification.

- [ ] **Step 1: Add `AgentUiEvent`, extend `ChatStreamChunk` and `ToolUiEvent`**

In `src/ui/cast-design/tool-call.types.ts`, add `agentId?: string;` to all three variants of `ToolUiEvent` (after `callId?`), and append:

```typescript
export type AgentUiEvent =
  | { type: 'spawned'; agentId: string; agentName: string; task: string }
  | { type: 'progress'; agentId: string; currentTool?: string; tokens?: number }
  | {
    type: 'completed';
    agentId: string;
    durationMs: number;
    tokens?: number;
    summary?: string;
  }
  | { type: 'failed'; agentId: string; durationMs: number; error: string };
```

Change `ChatStreamChunk` to:

```typescript
export type ChatStreamChunk =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; event: ToolUiEvent }
  | { kind: 'agent'; event: AgentUiEvent };
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS (no consumers break — new chunk kind is additive; switch/if chains on `chunk.kind === 'tool'` fall through to text handling, fixed in Task 9).

If typecheck reports exhaustiveness errors in files that switch over `ChatStreamChunk`, add a no-op `case 'agent': break;` (or `if (chunk.kind === 'agent') return;`) in those files — Task 9 replaces them with real handling.

- [ ] **Step 3: Commit (with user approval)**

```bash
git add src/ui/cast-design/tool-call.types.ts
git commit -m "feat(ui): add agent stream chunk and AgentUiEvent types"
```

---

### Task 2: MultilineBuffer

**Files:**
- Create: `src/ui/live-region/multiline-buffer.ts`
- Test: `src/ui/live-region/multiline-buffer.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MultilineBuffer } from './multiline-buffer';

describe('MultilineBuffer', () => {
  test('starts empty with cursor at origin', () => {
    const b = new MultilineBuffer();
    assert.equal(b.text, '');
    assert.equal(b.isEmpty, true);
    assert.deepEqual(b.cursor, { row: 0, col: 0 });
  });

  test('insert advances cursor', () => {
    const b = new MultilineBuffer();
    b.insert('hello');
    assert.equal(b.text, 'hello');
    assert.deepEqual(b.cursor, { row: 0, col: 5 });
  });

  test('insert with embedded newlines splits lines', () => {
    const b = new MultilineBuffer();
    b.insert('a\nb\nc');
    assert.deepEqual([...b.getLines()], ['a', 'b', 'c']);
    assert.deepEqual(b.cursor, { row: 2, col: 1 });
  });

  test('newline splits current line at cursor', () => {
    const b = new MultilineBuffer();
    b.insert('hello');
    b.moveLeft();
    b.moveLeft();
    b.newline();
    assert.deepEqual([...b.getLines()], ['hel', 'lo']);
    assert.deepEqual(b.cursor, { row: 1, col: 0 });
  });

  test('backspace at line start joins lines', () => {
    const b = new MultilineBuffer();
    b.insert('ab\ncd');
    b.moveHome();
    b.backspace();
    assert.equal(b.text, 'abcd');
    assert.deepEqual(b.cursor, { row: 0, col: 2 });
  });

  test('backspace mid-line removes char before cursor', () => {
    const b = new MultilineBuffer();
    b.insert('abc');
    b.moveLeft();
    b.backspace();
    assert.equal(b.text, 'ac');
    assert.deepEqual(b.cursor, { row: 0, col: 1 });
  });

  test('deleteForward at line end joins next line', () => {
    const b = new MultilineBuffer();
    b.insert('ab\ncd');
    b.moveToStart();
    b.moveEnd();
    b.deleteForward();
    assert.equal(b.text, 'abcd');
  });

  test('up/down clamp column to line length', () => {
    const b = new MultilineBuffer();
    b.insert('long line\nab');
    assert.deepEqual(b.cursor, { row: 1, col: 2 });
    b.moveUp();
    assert.deepEqual(b.cursor, { row: 0, col: 2 });
    b.moveEnd();
    b.moveDown();
    assert.deepEqual(b.cursor, { row: 1, col: 2 });
  });

  test('moveUp on first row reports false (caller falls back to history)', () => {
    const b = new MultilineBuffer();
    b.insert('one');
    assert.equal(b.moveUp(), false);
    b.insert('\ntwo');
    assert.equal(b.moveUp(), true);
  });

  test('deleteWordBack removes trailing word and whitespace', () => {
    const b = new MultilineBuffer();
    b.insert('git commit  ');
    b.deleteWordBack();
    assert.equal(b.text, 'git ');
  });

  test('killToStart / killToEnd', () => {
    const b = new MultilineBuffer();
    b.insert('abcdef');
    b.moveLeft();
    b.moveLeft();
    b.killToEnd();
    assert.equal(b.text, 'abcd');
    b.killToStart();
    assert.equal(b.text, '');
  });

  test('setText replaces content and puts cursor at end', () => {
    const b = new MultilineBuffer();
    b.insert('old');
    b.setText('new\ntext');
    assert.equal(b.text, 'new\ntext');
    assert.deepEqual(b.cursor, { row: 1, col: 4 });
  });

  test('clear resets everything', () => {
    const b = new MultilineBuffer();
    b.insert('a\nb');
    b.clear();
    assert.equal(b.text, '');
    assert.deepEqual(b.cursor, { row: 0, col: 0 });
    assert.equal(b.lineCount, 1);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test -r ts-node/register src/ui/live-region/multiline-buffer.spec.ts`
Expected: FAIL — `Cannot find module './multiline-buffer'`

- [ ] **Step 3: Implement**

```typescript
export interface CursorPosition {
  row: number;
  col: number;
}

export class MultilineBuffer {
  private lines: string[] = [''];
  private row = 0;
  private col = 0;

  get text(): string {
    return this.lines.join('\n');
  }

  get isEmpty(): boolean {
    return this.lines.length === 1 && this.lines[0] === '';
  }

  get cursor(): CursorPosition {
    return { row: this.row, col: this.col };
  }

  get lineCount(): number {
    return this.lines.length;
  }

  getLines(): readonly string[] {
    return this.lines;
  }

  setText(text: string): void {
    this.lines = text.split('\n');
    if (this.lines.length === 0) this.lines = [''];
    this.row = this.lines.length - 1;
    this.col = this.lines[this.row].length;
  }

  insert(text: string): void {
    const parts = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const current = this.lines[this.row];
    const before = current.slice(0, this.col);
    const after = current.slice(this.col);

    if (parts.length === 1) {
      this.lines[this.row] = before + parts[0] + after;
      this.col += parts[0].length;
      return;
    }

    const middle = parts.slice(1, -1);
    const last = parts[parts.length - 1];
    this.lines.splice(
      this.row,
      1,
      before + parts[0],
      ...middle,
      last + after,
    );
    this.row += parts.length - 1;
    this.col = last.length;
  }

  newline(): void {
    this.insert('\n');
  }

  backspace(): void {
    if (this.col > 0) {
      const line = this.lines[this.row];
      this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col);
      this.col--;
      return;
    }
    if (this.row > 0) {
      const prev = this.lines[this.row - 1];
      this.col = prev.length;
      this.lines[this.row - 1] = prev + this.lines[this.row];
      this.lines.splice(this.row, 1);
      this.row--;
    }
  }

  deleteForward(): void {
    const line = this.lines[this.row];
    if (this.col < line.length) {
      this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + 1);
      return;
    }
    if (this.row < this.lines.length - 1) {
      this.lines[this.row] = line + this.lines[this.row + 1];
      this.lines.splice(this.row + 1, 1);
    }
  }

  deleteWordBack(): void {
    const before = this.lines[this.row].slice(0, this.col);
    const match = before.match(/\S+\s*$/);
    if (match) {
      const len = match[0].length;
      const line = this.lines[this.row];
      this.lines[this.row] = line.slice(0, this.col - len) + line.slice(this.col);
      this.col -= len;
    } else if (this.col === 0 && this.row > 0) {
      this.backspace();
    }
  }

  killToStart(): void {
    this.lines[this.row] = this.lines[this.row].slice(this.col);
    this.col = 0;
  }

  killToEnd(): void {
    this.lines[this.row] = this.lines[this.row].slice(0, this.col);
  }

  moveLeft(): void {
    if (this.col > 0) {
      this.col--;
    } else if (this.row > 0) {
      this.row--;
      this.col = this.lines[this.row].length;
    }
  }

  moveRight(): void {
    if (this.col < this.lines[this.row].length) {
      this.col++;
    } else if (this.row < this.lines.length - 1) {
      this.row++;
      this.col = 0;
    }
  }

  /** Returns false when already on the first row (caller may use history instead). */
  moveUp(): boolean {
    if (this.row === 0) return false;
    this.row--;
    this.col = Math.min(this.col, this.lines[this.row].length);
    return true;
  }

  /** Returns false when already on the last row. */
  moveDown(): boolean {
    if (this.row >= this.lines.length - 1) return false;
    this.row++;
    this.col = Math.min(this.col, this.lines[this.row].length);
    return true;
  }

  moveHome(): void {
    this.col = 0;
  }

  moveEnd(): void {
    this.col = this.lines[this.row].length;
  }

  moveToStart(): void {
    this.row = 0;
    this.col = 0;
  }

  moveToEnd(): void {
    this.row = this.lines.length - 1;
    this.col = this.lines[this.row].length;
  }

  clear(): void {
    this.lines = [''];
    this.row = 0;
    this.col = 0;
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test -r ts-node/register src/ui/live-region/multiline-buffer.spec.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit (with user approval)**

```bash
git add src/ui/live-region/multiline-buffer.ts src/ui/live-region/multiline-buffer.spec.ts
git commit -m "feat(ui): add MultilineBuffer for multiline REPL input"
```

---

### Task 3: KeyDecoder

**Files:**
- Create: `src/ui/live-region/key-decoder.ts`
- Test: `src/ui/live-region/key-decoder.spec.ts`

Background for the implementer: in terminal raw mode, Enter arrives as `\r` (0x0d) and Ctrl+J as `\n` (0x0a) — they are distinct bytes. The current `smart-input.ts` wrongly treats both as submit. Ctrl+Enter is only distinguishable when the kitty keyboard protocol is active, where it arrives as the CSI-u sequence `\x1b[13;5u`. Bracketed paste wraps pasted text in `\x1b[200~` … `\x1b[201~`.

- [ ] **Step 1: Write failing tests**

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KeyDecoder, KeyEvent } from './key-decoder';

function feed(decoder: KeyDecoder, data: string): KeyEvent[] {
  return decoder.feed(data);
}

describe('KeyDecoder', () => {
  test('plain chars become char events', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, 'ab'), [
      { type: 'char', char: 'a' },
      { type: 'char', char: 'b' },
    ]);
  });

  test('CR is enter, LF is newline (Ctrl+J)', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\r'), [{ type: 'enter' }]);
    assert.deepEqual(feed(d, '\n'), [{ type: 'newline' }]);
  });

  test('kitty Ctrl+Enter CSI-u sequence is newline', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[13;5u'), [{ type: 'newline' }]);
  });

  test('kitty plain Enter CSI-u sequence is enter', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[13u'), [{ type: 'enter' }]);
  });

  test('arrows, home, end, delete, shift-tab', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[A'), [{ type: 'up' }]);
    assert.deepEqual(feed(d, '\x1b[B'), [{ type: 'down' }]);
    assert.deepEqual(feed(d, '\x1b[C'), [{ type: 'right' }]);
    assert.deepEqual(feed(d, '\x1b[D'), [{ type: 'left' }]);
    assert.deepEqual(feed(d, '\x1b[H'), [{ type: 'home' }]);
    assert.deepEqual(feed(d, '\x1b[F'), [{ type: 'end' }]);
    assert.deepEqual(feed(d, '\x1b[3~'), [{ type: 'delete' }]);
    assert.deepEqual(feed(d, '\x1b[Z'), [{ type: 'shift-tab' }]);
  });

  test('control chars map to ctrl events', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x03'), [{ type: 'ctrl', key: 'c' }]);
    assert.deepEqual(feed(d, '\x04'), [{ type: 'ctrl', key: 'd' }]);
    assert.deepEqual(feed(d, '\x0f'), [{ type: 'ctrl', key: 'o' }]);
    assert.deepEqual(feed(d, '\x17'), [{ type: 'ctrl', key: 'w' }]);
  });

  test('backspace variants', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x7f'), [{ type: 'backspace' }]);
    assert.deepEqual(feed(d, '\x08'), [{ type: 'backspace' }]);
  });

  test('bracketed paste is one paste event with newlines preserved', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[200~line1\nline2\x1b[201~'), [
      { type: 'paste', text: 'line1\nline2' },
    ]);
  });

  test('paste split across feed calls buffers until terminator', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[200~part1'), []);
    assert.deepEqual(feed(d, ' part2\x1b[201~x'), [
      { type: 'paste', text: 'part1 part2' },
      { type: 'char', char: 'x' },
    ]);
  });

  test('escape sequence split across feed calls', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b'), []);
    assert.deepEqual(feed(d, '[A'), [{ type: 'up' }]);
  });

  test('unknown CSI sequences are swallowed, not leaked as chars', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, '\x1b[?1u'), []);
    assert.deepEqual(feed(d, 'a'), [{ type: 'char', char: 'a' }]);
  });

  test('multi-byte UTF-8 chars pass through as single char events', () => {
    const d = new KeyDecoder();
    assert.deepEqual(feed(d, 'é🌰'), [
      { type: 'char', char: 'é' },
      { type: 'char', char: '🌰' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test -r ts-node/register src/ui/live-region/key-decoder.spec.ts`
Expected: FAIL — `Cannot find module './key-decoder'`

- [ ] **Step 3: Implement**

```typescript
export type KeyEvent =
  | { type: 'char'; char: string }
  | { type: 'paste'; text: string }
  | { type: 'enter' }
  | { type: 'newline' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'tab' }
  | { type: 'shift-tab' }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'ctrl'; key: string };

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

const CTRL_KEYS: Record<number, string> = {
  0x01: 'a', 0x02: 'b', 0x03: 'c', 0x04: 'd', 0x05: 'e', 0x06: 'f',
  0x0b: 'k', 0x0c: 'l', 0x0e: 'n', 0x0f: 'o', 0x10: 'p', 0x12: 'r',
  0x14: 't', 0x15: 'u', 0x16: 'v', 0x17: 'w', 0x18: 'x', 0x19: 'y',
  0x1a: 'z',
};

const CSI_SIMPLE: Record<string, KeyEvent> = {
  A: { type: 'up' },
  B: { type: 'down' },
  C: { type: 'right' },
  D: { type: 'left' },
  H: { type: 'home' },
  F: { type: 'end' },
  Z: { type: 'shift-tab' },
};

export class KeyDecoder {
  private pending = '';
  private pasteBuffer: string | null = null;

  feed(data: string): KeyEvent[] {
    let input = this.pending + data;
    this.pending = '';
    const events: KeyEvent[] = [];

    while (input.length > 0) {
      if (this.pasteBuffer !== null) {
        const endIdx = input.indexOf(PASTE_END);
        if (endIdx === -1) {
          // Keep a tail in case PASTE_END straddles the chunk boundary.
          const safe = Math.max(0, input.length - (PASTE_END.length - 1));
          this.pasteBuffer += input.slice(0, safe);
          this.pending = '';
          const tail = input.slice(safe);
          if (tail.length > 0 && PASTE_END.startsWith(tail)) {
            this.pending = tail;
          } else {
            this.pasteBuffer += tail;
          }
          return events;
        }
        this.pasteBuffer += input.slice(0, endIdx);
        events.push({ type: 'paste', text: this.pasteBuffer });
        this.pasteBuffer = null;
        input = input.slice(endIdx + PASTE_END.length);
        continue;
      }

      if (input.startsWith(PASTE_START)) {
        this.pasteBuffer = '';
        input = input.slice(PASTE_START.length);
        continue;
      }

      if (input[0] === '\x1b') {
        if (input.length === 1 || (input[1] === '[' && input.length === 2)) {
          this.pending = input;
          return events;
        }
        if (input[1] !== '[') {
          // Bare ESC or Alt+key: swallow the ESC byte.
          input = input.slice(1);
          continue;
        }
        // CSI sequence: ESC [ <params> <final byte 0x40-0x7e>
        let end = -1;
        for (let j = 2; j < input.length; j++) {
          const c = input.charCodeAt(j);
          if (c >= 0x40 && c <= 0x7e) {
            end = j;
            break;
          }
        }
        if (end === -1) {
          if (input.length < 16) {
            this.pending = input;
            return events;
          }
          input = input.slice(2); // malformed, drop ESC [
          continue;
        }

        const params = input.slice(2, end);
        const final = input[end];
        input = input.slice(end + 1);

        if (final === 'u') {
          // CSI-u (kitty): <codepoint>;<modifiers>u
          const [codeStr, modStr] = params.split(';');
          if (codeStr === '13') {
            const mod = Number.parseInt(modStr || '1', 10);
            // modifier 5 = Ctrl (1 + 4); any Ctrl combination inserts newline
            events.push(mod >= 5 ? { type: 'newline' } : { type: 'enter' });
          }
          continue; // other CSI-u (incl. ?-flag replies) swallowed
        }
        if (final === '~' && params === '3') {
          events.push({ type: 'delete' });
          continue;
        }
        const simple = CSI_SIMPLE[final];
        if (simple && params === '') {
          events.push(simple);
        }
        continue; // unknown CSI swallowed
      }

      const char = String.fromCodePoint(input.codePointAt(0)!);
      input = input.slice(char.length);
      const code = char.charCodeAt(0);

      if (code === 0x0d) {
        events.push({ type: 'enter' });
      } else if (code === 0x0a) {
        events.push({ type: 'newline' });
      } else if (code === 0x09) {
        events.push({ type: 'tab' });
      } else if (code === 0x7f || code === 0x08) {
        events.push({ type: 'backspace' });
      } else if (CTRL_KEYS[code]) {
        events.push({ type: 'ctrl', key: CTRL_KEYS[code] });
      } else if (code >= 0x20) {
        events.push({ type: 'char', char });
      }
    }

    return events;
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test -r ts-node/register src/ui/live-region/key-decoder.spec.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit (with user approval)**

```bash
git add src/ui/live-region/key-decoder.ts src/ui/live-region/key-decoder.spec.ts
git commit -m "feat(ui): add KeyDecoder with CSI-u and bracketed paste support"
```

---

### Task 4: Kitty keyboard protocol detection

**Files:**
- Create: `src/ui/live-region/kitty-protocol.ts`
- Test: `src/ui/live-region/kitty-protocol.spec.ts`

Detection handshake: write `\x1b[?u` (query kitty flags) followed by `\x1b[c` (device attributes — every terminal answers this). If the terminal replies with `\x1b[?<flags>u` before the `\x1b[?…c` reply, kitty protocol is supported. 50ms timeout; failure → legacy mode. When supported, enable with push `\x1b[>1u`, and pop `\x1b[<u` on exit.

- [ ] **Step 1: Write failing tests**

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectKittyProtocol, KITTY_ENABLE, KITTY_DISABLE } from './kitty-protocol';
import { EventEmitter } from 'node:events';

function fakeStdin(): NodeJS.ReadStream & EventEmitter {
  const emitter = new EventEmitter() as any;
  emitter.isTTY = true;
  return emitter;
}

describe('detectKittyProtocol', () => {
  test('resolves true when terminal replies with CSI ? u before device attributes', async () => {
    const stdin = fakeStdin();
    const writes: string[] = [];
    const promise = detectKittyProtocol({
      stdin,
      write: (s) => writes.push(s),
      timeoutMs: 1000,
    });
    stdin.emit('data', '\x1b[?0u\x1b[?62c');
    assert.equal(await promise, true);
    assert.equal(writes.join(''), '\x1b[?u\x1b[c');
  });

  test('resolves false when only device attributes reply arrives', async () => {
    const stdin = fakeStdin();
    const promise = detectKittyProtocol({
      stdin,
      write: () => {},
      timeoutMs: 1000,
    });
    stdin.emit('data', '\x1b[?62c');
    assert.equal(await promise, false);
  });

  test('resolves false on timeout', async () => {
    const stdin = fakeStdin();
    const result = await detectKittyProtocol({
      stdin,
      write: () => {},
      timeoutMs: 10,
    });
    assert.equal(result, false);
  });

  test('resolves false immediately when stdin is not a TTY', async () => {
    const stdin = fakeStdin();
    (stdin as any).isTTY = false;
    const result = await detectKittyProtocol({
      stdin,
      write: () => {},
      timeoutMs: 1000,
    });
    assert.equal(result, false);
  });

  test('enable/disable sequences are the kitty push/pop codes', () => {
    assert.equal(KITTY_ENABLE, '\x1b[>1u');
    assert.equal(KITTY_DISABLE, '\x1b[<u');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test -r ts-node/register src/ui/live-region/kitty-protocol.spec.ts`
Expected: FAIL — `Cannot find module './kitty-protocol'`

- [ ] **Step 3: Implement**

```typescript
export const KITTY_ENABLE = '\x1b[>1u';
export const KITTY_DISABLE = '\x1b[<u';

export interface KittyDetectOptions {
  stdin: NodeJS.ReadStream;
  write: (s: string) => void;
  timeoutMs?: number;
}

/**
 * Detects kitty keyboard protocol support. Sends a flags query followed by a
 * device-attributes query; a `CSI ? <flags> u` reply arriving before the
 * `CSI ? ... c` reply means the protocol is supported.
 */
export function detectKittyProtocol(options: KittyDetectOptions): Promise<boolean> {
  const { stdin, write, timeoutMs = 50 } = options;

  if (!stdin.isTTY) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let buffer = '';
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      stdin.removeListener('data', onData);
      clearTimeout(timer);
      resolve(result);
    };

    const onData = (data: Buffer | string) => {
      buffer += data.toString();
      if (/\x1b\[\?\d+u/.test(buffer)) {
        finish(true);
      } else if (/\x1b\[\?[\d;]*c/.test(buffer)) {
        finish(false);
      }
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    stdin.on('data', onData);
    write('\x1b[?u\x1b[c');
  });
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test -r ts-node/register src/ui/live-region/kitty-protocol.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit (with user approval)**

```bash
git add src/ui/live-region/kitty-protocol.ts src/ui/live-region/kitty-protocol.spec.ts
git commit -m "feat(ui): add kitty keyboard protocol detection"
```

---

### Task 5: LiveRegionCompositor

**Files:**
- Create: `src/ui/live-region/compositor.ts`
- Test: `src/ui/live-region/compositor.spec.ts`

The compositor is the single owner of cursor math for the bottom-of-screen live region. Blocks return lines; the compositor clears the old region, writes all lines, and positions the hardware cursor at the focused block's logical cursor.

- [ ] **Step 1: Write failing tests**

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LiveRegionCompositor, LiveBlock } from './compositor';

class FakeOut {
  data = '';
  isTTY = true;
  columns = 40;
  write = (s: string) => {
    this.data += s;
  };
  reset() {
    this.data = '';
  }
}

function staticBlock(id: string, lines: string[]): LiveBlock {
  return { id, render: () => lines };
}

describe('LiveRegionCompositor', () => {
  test('first repaint writes all block lines in order', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['line-a']));
    c.addBlock(staticBlock('b', ['line-b1', 'line-b2']));
    c.repaint();
    assert.match(out.data, /line-a/);
    assert.match(out.data, /line-b1/);
    assert.match(out.data, /line-b2/);
    assert.equal(
      out.data.indexOf('line-a') < out.data.indexOf('line-b1'),
      true,
    );
  });

  test('second repaint moves cursor up to region start and clears', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['one', 'two', 'three']));
    c.repaint();
    out.reset();
    c.repaint();
    // cursor parked on last line (row 2 of 3) → up 2 to region top
    assert.match(out.data, /\x1b\[2A/);
    assert.match(out.data, /\x1b\[0J/);
  });

  test('scrollOut writes content above the region', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['input-box']));
    c.repaint();
    out.reset();
    c.scrollOut('finished work\r\n');
    const i = out.data.indexOf('finished work');
    const j = out.data.lastIndexOf('input-box');
    assert.equal(i >= 0 && j > i, true);
  });

  test('setCursor positions hardware cursor inside the focused block', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('tree', ['t1', 't2']));
    c.addBlock(staticBlock('input', ['i1', 'i2', 'i3']));
    c.setCursor('input', 1, 4); // row 1 within input block → absolute row 3 of 5
    c.repaint();
    // 5 lines written, cursor ends on absolute row 3: up (5-1-3)=1, col 5
    assert.match(out.data, /\x1b\[1A/);
    assert.match(out.data, /\x1b\[5G/);
  });

  test('removeBlock drops its lines on next repaint', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['aaa']));
    c.addBlock(staticBlock('b', ['bbb']));
    c.repaint();
    c.removeBlock('a');
    out.reset();
    c.repaint();
    assert.equal(out.data.includes('aaa'), false);
    assert.match(out.data, /bbb/);
  });

  test('clear erases the region and forgets state', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['xx', 'yy']));
    c.repaint();
    out.reset();
    c.clear();
    assert.match(out.data, /\x1b\[0J/);
    out.reset();
    c.repaint();
    // after clear, repaint must not move up (no previous region)
    assert.equal(/\x1b\[\d+A/.test(out.data), false);
  });

  test('non-TTY output disables painting; scrollOut still writes content', () => {
    const out = new FakeOut();
    out.isTTY = false;
    const c = new LiveRegionCompositor(out);
    c.addBlock(staticBlock('a', ['hidden']));
    c.repaint();
    assert.equal(out.data, '');
    c.scrollOut('plain\r\n');
    assert.equal(out.data, 'plain\r\n');
  });

  test('render exceptions degrade to append-only instead of throwing', () => {
    const out = new FakeOut();
    const c = new LiveRegionCompositor(out);
    c.addBlock({
      id: 'bad',
      render: () => {
        throw new Error('boom');
      },
    });
    assert.doesNotThrow(() => c.repaint());
    c.scrollOut('still works\r\n');
    assert.match(out.data, /still works/);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test -r ts-node/register src/ui/live-region/compositor.spec.ts`
Expected: FAIL — `Cannot find module './compositor'`

- [ ] **Step 3: Implement**

```typescript
export interface LiveBlock {
  id: string;
  render(width: number): string[];
  isAnimated?(): boolean;
}

export interface CompositorOutput {
  write: (s: string) => void;
  isTTY: boolean;
  columns: number;
}

interface CursorTarget {
  blockId: string;
  row: number;
  col: number;
}

export class LiveRegionCompositor {
  private blocks: LiveBlock[] = [];
  private renderedLineCount = 0;
  private cursorAbsoluteRow = 0;
  private cursorTarget: CursorTarget | null = null;
  private degraded = false;
  private ticker: NodeJS.Timeout | null = null;
  private tickListeners: Array<() => void> = [];

  constructor(private readonly out: CompositorOutput) {}

  addBlock(block: LiveBlock, index?: number): void {
    if (index === undefined) {
      this.blocks.push(block);
    } else {
      this.blocks.splice(index, 0, block);
    }
  }

  removeBlock(id: string): void {
    this.blocks = this.blocks.filter((b) => b.id !== id);
    if (this.cursorTarget?.blockId === id) {
      this.cursorTarget = null;
    }
  }

  getBlock(id: string): LiveBlock | undefined {
    return this.blocks.find((b) => b.id === id);
  }

  setCursor(blockId: string, row: number, col: number): void {
    this.cursorTarget = { blockId, row, col };
  }

  onTick(listener: () => void): void {
    this.tickListeners.push(listener);
  }

  repaint(): void {
    if (!this.out.isTTY || this.degraded) return;

    try {
      const width = Math.max(1, this.out.columns || 80);
      const allLines: string[] = [];
      let cursorRow = 0;
      let cursorCol = 0;

      for (const block of this.blocks) {
        const lines = block.render(width);
        if (
          this.cursorTarget &&
          block.id === this.cursorTarget.blockId
        ) {
          cursorRow = allLines.length + Math.min(this.cursorTarget.row, Math.max(0, lines.length - 1));
          cursorCol = this.cursorTarget.col;
        }
        allLines.push(...lines);
      }

      let outBuf = '';
      if (this.cursorAbsoluteRow > 0) {
        outBuf += `\x1b[${this.cursorAbsoluteRow}A`;
      }
      outBuf += '\r\x1b[0J';

      for (let i = 0; i < allLines.length; i++) {
        outBuf += allLines[i];
        if (i < allLines.length - 1) outBuf += '\r\n';
      }

      const lastRow = Math.max(0, allLines.length - 1);
      if (this.cursorTarget === null) {
        cursorRow = lastRow;
        cursorCol = 0;
      }
      const up = lastRow - cursorRow;
      if (up > 0) outBuf += `\x1b[${up}A`;
      outBuf += `\x1b[${cursorCol + 1}G`;

      this.out.write(outBuf);
      this.renderedLineCount = allLines.length;
      this.cursorAbsoluteRow = cursorRow;
      this.updateTicker();
    } catch {
      this.degraded = true;
    }
  }

  /** Writes content into scrollback above the live region, then repaints. */
  scrollOut(content: string): void {
    if (!this.out.isTTY || this.degraded) {
      this.out.write(content);
      return;
    }
    this.eraseRegion();
    this.out.write(content);
    if (content.length > 0 && !content.endsWith('\n')) {
      this.out.write('\r\n');
    }
    this.repaint();
  }

  clear(): void {
    if (!this.out.isTTY) return;
    this.eraseRegion();
    this.stopTicker();
  }

  destroy(): void {
    this.clear();
    this.tickListeners = [];
  }

  private eraseRegion(): void {
    if (this.renderedLineCount <= 0) return;
    let outBuf = '';
    if (this.cursorAbsoluteRow > 0) {
      outBuf += `\x1b[${this.cursorAbsoluteRow}A`;
    }
    outBuf += '\r\x1b[0J';
    this.out.write(outBuf);
    this.renderedLineCount = 0;
    this.cursorAbsoluteRow = 0;
  }

  private updateTicker(): void {
    const animated = this.blocks.some((b) => b.isAnimated?.());
    if (animated && !this.ticker) {
      this.ticker = setInterval(() => {
        for (const listener of this.tickListeners) listener();
        this.repaint();
      }, 100);
      this.ticker.unref?.();
    } else if (!animated) {
      this.stopTicker();
    }
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test -r ts-node/register src/ui/live-region/compositor.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit (with user approval)**

```bash
git add src/ui/live-region/compositor.ts src/ui/live-region/compositor.spec.ts
git commit -m "feat(ui): add LiveRegionCompositor for bottom-of-screen rendering"
```

---

### Task 6: InputBoxBlock and FooterBlock

**Files:**
- Create: `src/ui/live-region/input-box-block.ts`
- Create: `src/ui/live-region/footer-block.ts`
- Test: `src/ui/live-region/input-box-block.spec.ts`
- Test: `src/ui/live-region/footer-block.spec.ts`

Box layout per spec: rounded border, `› ` label on first content line, continuation lines indented to align, dim placeholder when empty. Inner text width = terminal width − 4 (`│ ` + ` │`) − 2 (label) on every line. Below 40 columns, no borders — plain `› ` prompt.

- [ ] **Step 1: Write failing tests for InputBoxBlock**

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { InputBoxBlock } from './input-box-block';
import { stripAnsi } from '../cast-design/cli-renderer';

describe('InputBoxBlock', () => {
  test('renders bordered box with label and placeholder when empty', () => {
    const block = new InputBoxBlock({ placeholder: 'Type a message' });
    const lines = block.render(40).map(stripAnsi);
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^╭─+╮$/);
    assert.match(lines[1], /^│ › Type a message\s+│$/);
    assert.match(lines[2], /^╰─+╯$/);
  });

  test('renders buffer lines inside the box', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('hello\nworld');
    const lines = block.render(40).map(stripAnsi);
    assert.equal(lines.length, 4);
    assert.match(lines[1], /│ › hello\s+│/);
    assert.match(lines[2], /│ {3}world\s+│/);
  });

  test('wraps long lines to box width', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('a'.repeat(50));
    const lines = block.render(40).map(stripAnsi);
    // inner text width = 40 - 4 - 2 = 34 → 50 chars = 2 rows
    assert.equal(lines.length, 4);
  });

  test('cursorPosition maps buffer cursor to block coordinates', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('hello\nwo');
    const pos = block.cursorPosition(40);
    // row 0 is the top border; buffer row 1 → block row 2
    assert.deepEqual(pos, { row: 2, col: 2 + 2 + 2 });
  });

  test('narrow terminal drops borders', () => {
    const block = new InputBoxBlock({});
    block.buffer.insert('hi');
    const lines = block.render(30).map(stripAnsi);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^› hi$/);
  });
});
```

- [ ] **Step 2: Write failing tests for FooterBlock**

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FooterBlock } from './footer-block';
import { stripAnsi } from '../cast-design/cli-renderer';

describe('FooterBlock', () => {
  test('renders mode, model and hints joined by dots', () => {
    const block = new FooterBlock();
    block.setStatus({ mode: 'plan', model: 'gpt-4.1', hints: ['Ctrl+J newline'] });
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /plan · gpt-4\.1 · Ctrl\+J newline/);
  });

  test('suggestions replace the status line', () => {
    const block = new FooterBlock();
    block.setStatus({ mode: 'auto', model: 'm', hints: [] });
    block.setSuggestions(
      [
        { text: '/help', display: '/help', description: 'Show help' },
        { text: '/up', display: '/up', description: 'Commit' },
      ],
      1,
    );
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /\/help/);
    assert.match(lines[1], /❯.*\/up/);
    block.setSuggestions([], -1);
    assert.equal(block.render(80).map(stripAnsi)[0].includes('auto'), true);
  });

  test('caps visible suggestions at 10 with overflow markers', () => {
    const block = new FooterBlock();
    const many = Array.from({ length: 15 }, (_, i) => ({
      text: `/cmd${i}`,
      display: `/cmd${i}`,
    }));
    block.setSuggestions(many, 12);
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.some((l) => l.includes('above')), true);
    assert.equal(lines.length <= 12, true);
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `node --test -r ts-node/register src/ui/live-region/input-box-block.spec.ts src/ui/live-region/footer-block.spec.ts`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement InputBoxBlock**

```typescript
import { Box, Colors } from '../../modules/repl/utils/theme';
import { visibleWidth } from '../cast-design/cli-renderer';
import type { LiveBlock } from './compositor';
import { MultilineBuffer } from './multiline-buffer';

const MIN_BOX_WIDTH = 40;
const LABEL = '› ';

export interface InputBoxOptions {
  placeholder?: string;
}

export class InputBoxBlock implements LiveBlock {
  readonly id = 'input-box';
  readonly buffer = new MultilineBuffer();

  constructor(private readonly opts: InputBoxOptions) {}

  /** Inner width available for text on each box row. */
  private textWidth(width: number): number {
    return width - 4 - LABEL.length;
  }

  /**
   * Visual rows for the buffer: each logical line wraps at textWidth.
   * Returns row tuples of [logicalRow, text, isFirstChunkOfLine].
   */
  private visualRows(width: number): Array<{ text: string; logicalRow: number; chunkStart: number }> {
    const tw = Math.max(1, this.textWidth(width));
    const rows: Array<{ text: string; logicalRow: number; chunkStart: number }> = [];
    const lines = this.buffer.getLines();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length === 0) {
        rows.push({ text: '', logicalRow: i, chunkStart: 0 });
        continue;
      }
      for (let off = 0; off < line.length; off += tw) {
        rows.push({ text: line.slice(off, off + tw), logicalRow: i, chunkStart: off });
      }
    }
    return rows;
  }

  render(width: number): string[] {
    if (width < MIN_BOX_WIDTH) {
      return this.renderPlain();
    }

    const inner = width - 4;
    const top = `${Colors.subtle}${Box.topLeft}${Box.horizontal.repeat(width - 2)}${Box.topRight}${Colors.reset}`;
    const bottom = `${Colors.subtle}${Box.bottomLeft}${Box.horizontal.repeat(width - 2)}${Box.bottomRight}${Colors.reset}`;
    const rows = this.visualRows(width);
    const lines: string[] = [top];

    if (this.buffer.isEmpty) {
      const placeholder = this.opts.placeholder
        ? `${Colors.dim}${this.opts.placeholder}${Colors.reset}`
        : '';
      lines.push(this.boxRow(`${Colors.primary}${LABEL}${Colors.reset}${placeholder}`, inner));
    } else {
      for (let i = 0; i < rows.length; i++) {
        const prefix = i === 0
          ? `${Colors.primary}${LABEL}${Colors.reset}`
          : ' '.repeat(LABEL.length);
        lines.push(this.boxRow(`${prefix}${rows[i].text}`, inner));
      }
    }

    lines.push(bottom);
    return lines;
  }

  private renderPlain(): string[] {
    const lines = this.buffer.getLines();
    if (this.buffer.isEmpty && this.opts.placeholder) {
      return [`${Colors.primary}${LABEL}${Colors.reset}${Colors.dim}${this.opts.placeholder}${Colors.reset}`];
    }
    return lines.map((line, i) =>
      i === 0
        ? `${Colors.primary}${LABEL}${Colors.reset}${line}`
        : `${' '.repeat(LABEL.length)}${line}`,
    );
  }

  private boxRow(content: string, inner: number): string {
    const pad = ' '.repeat(Math.max(0, inner - visibleWidth(content)));
    return `${Colors.subtle}${Box.vertical}${Colors.reset} ${content}${pad} ${Colors.subtle}${Box.vertical}${Colors.reset}`;
  }

  /** Block-relative cursor position (row 0 = top border). */
  cursorPosition(width: number): { row: number; col: number } {
    const { row, col } = this.buffer.cursor;

    if (width < MIN_BOX_WIDTH) {
      return { row, col: LABEL.length + col };
    }

    const tw = Math.max(1, this.textWidth(width));
    const rows = this.visualRows(width);
    let visualRow = 0;
    let visualCol = col;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].logicalRow === row && col >= rows[i].chunkStart && col - rows[i].chunkStart <= tw - (col - rows[i].chunkStart === tw && i < rows.length - 1 && rows[i + 1].logicalRow === row ? 1 : 0)) {
        visualRow = i;
        visualCol = col - rows[i].chunkStart;
        if (visualCol === tw && i + 1 < rows.length && rows[i + 1].logicalRow === row) {
          visualRow = i + 1;
          visualCol = 0;
        }
        break;
      }
      visualRow = i;
    }

    // +1 for the top border row; +2 for '│ '; +LABEL on every row
    return { row: 1 + visualRow, col: 2 + LABEL.length + visualCol };
  }
}
```

- [ ] **Step 5: Implement FooterBlock**

```typescript
import { Colors } from '../../modules/repl/utils/theme';
import { truncateVisible, visibleWidth } from '../cast-design/cli-renderer';
import type { LiveBlock } from './compositor';
import type { Suggestion } from '../../modules/repl/services/smart-input';

export interface FooterStatus {
  mode: string;
  model: string;
  hints: string[];
}

const MAX_VISIBLE = 10;

export class FooterBlock implements LiveBlock {
  readonly id = 'footer';
  private status: FooterStatus = { mode: '', model: '', hints: [] };
  private suggestions: Suggestion[] = [];
  private selectedIndex = -1;

  setStatus(status: FooterStatus): void {
    this.status = status;
  }

  setSuggestions(suggestions: Suggestion[], selectedIndex: number): void {
    this.suggestions = suggestions;
    this.selectedIndex = selectedIndex;
  }

  render(width: number): string[] {
    if (this.suggestions.length > 0) {
      return this.renderSuggestions(width);
    }
    const parts = [this.status.mode, this.status.model, ...this.status.hints]
      .filter(Boolean)
      .join(' · ');
    return [`  ${Colors.dim}${truncateVisible(parts, Math.max(1, width - 2))}${Colors.reset}`];
  }

  private renderSuggestions(width: number): string[] {
    const total = this.suggestions.length;
    let start = 0;
    if (this.selectedIndex >= 0 && total > MAX_VISIBLE) {
      start = Math.max(
        0,
        Math.min(this.selectedIndex - Math.floor(MAX_VISIBLE / 2), total - MAX_VISIBLE),
      );
    }
    const end = Math.min(start + MAX_VISIBLE, total);
    const lines: string[] = [];

    if (start > 0) {
      lines.push(`    ${Colors.dim}↑ ${start} above${Colors.reset}`);
    }
    for (let i = start; i < end; i++) {
      const s = this.suggestions[i];
      const selected = i === this.selectedIndex;
      const marker = selected ? `  ${Colors.primary}❯${Colors.reset} ` : '    ';
      const budget = Math.max(1, width - 4);
      const display = truncateVisible(s.display, budget);
      const styled = selected
        ? `${Colors.bold}${Colors.primary}${display}${Colors.reset}`
        : `${Colors.dim}${display}${Colors.reset}`;
      let description = '';
      if (s.description && visibleWidth(display) < budget - 10) {
        description = `  ${Colors.muted}${truncateVisible(s.description, budget - visibleWidth(display) - 2)}${Colors.reset}`;
      }
      lines.push(`${marker}${styled}${description}`);
    }
    const remaining = total - end;
    if (remaining > 0) {
      lines.push(`    ${Colors.dim}↓ ${remaining} below${Colors.reset}`);
    }
    return lines;
  }
}
```

- [ ] **Step 6: Run tests, verify they pass**

Run: `node --test -r ts-node/register src/ui/live-region/input-box-block.spec.ts src/ui/live-region/footer-block.spec.ts`
Expected: PASS (8 tests). If the `cursorPosition` wrap test fails, simplify the wrap-boundary conditional — the invariant to satisfy: cursor at column `col` of logical row `row` lands on the visual row containing that offset, and a cursor exactly at a wrap boundary lands at column 0 of the next visual row.

- [ ] **Step 7: Commit (with user approval)**

```bash
git add src/ui/live-region/input-box-block.ts src/ui/live-region/footer-block.ts src/ui/live-region/input-box-block.spec.ts src/ui/live-region/footer-block.spec.ts
git commit -m "feat(ui): add InputBoxBlock and FooterBlock live-region blocks"
```

---

### Task 7: AgentTreeBlock

**Files:**
- Create: `src/ui/live-region/agent-tree-block.ts`
- Test: `src/ui/live-region/agent-tree-block.spec.ts`

Renders running sub-agents per spec mockup. On `completed`/`failed`, the agent leaves the tree and a summary line is handed to a `scrollOut` callback.

- [ ] **Step 1: Write failing tests**

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AgentTreeBlock } from './agent-tree-block';
import { stripAnsi } from '../cast-design/cli-renderer';

describe('AgentTreeBlock', () => {
  test('spawned agent renders name, task, spinner row', () => {
    const block = new AgentTreeBlock(() => {});
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'architect', task: 'Design auth' });
    const lines = block.render(80).map(stripAnsi);
    assert.match(lines[0], /● architect — Design auth/);
    assert.match(lines[1], /Running/);
  });

  test('progress updates current tool', () => {
    const block = new AgentTreeBlock(() => {});
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'coder', task: 'Implement' });
    block.handle({ type: 'progress', agentId: 'a1', currentTool: 'Edit src/x.ts' });
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.some((l) => l.includes('└ Edit src/x.ts')), true);
  });

  test('completed removes agent and scrolls out summary', () => {
    const scrolled: string[] = [];
    const block = new AgentTreeBlock((s) => scrolled.push(s));
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'reviewer', task: 'Review' });
    block.handle({ type: 'completed', agentId: 'a1', durationMs: 41000, summary: '3 issues found' });
    assert.equal(block.render(80).length, 0);
    assert.match(stripAnsi(scrolled.join('')), /✓ reviewer/);
    assert.match(stripAnsi(scrolled.join('')), /41s/);
    assert.match(stripAnsi(scrolled.join('')), /3 issues found/);
  });

  test('failed scrolls out error line', () => {
    const scrolled: string[] = [];
    const block = new AgentTreeBlock((s) => scrolled.push(s));
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'tester', task: 'Test' });
    block.handle({ type: 'failed', agentId: 'a1', durationMs: 2000, error: 'tool crash\nstack...' });
    assert.equal(block.render(80).length, 0);
    const out = stripAnsi(scrolled.join(''));
    assert.match(out, /✗ tester/);
    assert.match(out, /tool crash/);
    assert.equal(out.includes('stack...'), false);
  });

  test('tokens shown when provided', () => {
    const block = new AgentTreeBlock(() => {});
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'coder', task: 'X' });
    block.handle({ type: 'progress', agentId: 'a1', tokens: 12300 });
    const lines = block.render(80).map(stripAnsi);
    assert.equal(lines.some((l) => l.includes('12.3k tk')), true);
  });

  test('clearAll empties tree without scrolling out (teardown path)', () => {
    const scrolled: string[] = [];
    const block = new AgentTreeBlock((s) => scrolled.push(s));
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'x', task: 'y' });
    block.clearAll();
    assert.equal(block.render(80).length, 0);
    assert.equal(scrolled.length, 0);
  });

  test('isAnimated true only while agents are running', () => {
    const block = new AgentTreeBlock(() => {});
    assert.equal(block.isAnimated(), false);
    block.handle({ type: 'spawned', agentId: 'a1', agentName: 'x', task: 'y' });
    assert.equal(block.isAnimated(), true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test -r ts-node/register src/ui/live-region/agent-tree-block.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
import { Colors, Icons } from '../../modules/repl/utils/theme';
import { truncateVisible } from '../cast-design/cli-renderer';
import { formatDuration } from '../cast-design/tool-call-details';
import type { AgentUiEvent } from '../cast-design/tool-call.types';
import type { LiveBlock } from './compositor';

interface AgentEntry {
  agentId: string;
  agentName: string;
  task: string;
  currentTool?: string;
  tokens?: number;
  startedAt: number;
}

function formatTokens(tokens?: number): string {
  if (tokens === undefined) return '';
  if (tokens < 1000) return `${tokens} tk`;
  return `${(tokens / 1000).toFixed(1)}k tk`;
}

export class AgentTreeBlock implements LiveBlock {
  readonly id = 'agent-tree';
  private agents = new Map<string, AgentEntry>();
  private spinnerFrame = 0;

  constructor(private readonly scrollOut: (content: string) => void) {}

  handle(event: AgentUiEvent): void {
    if (event.type === 'spawned') {
      this.agents.set(event.agentId, {
        agentId: event.agentId,
        agentName: event.agentName,
        task: event.task,
        startedAt: Date.now(),
      });
      return;
    }

    const entry = this.agents.get(event.agentId);
    if (!entry) return;

    if (event.type === 'progress') {
      if (event.currentTool !== undefined) entry.currentTool = event.currentTool;
      if (event.tokens !== undefined) entry.tokens = event.tokens;
      return;
    }

    this.agents.delete(event.agentId);

    if (event.type === 'completed') {
      const meta = [
        `done in ${formatDuration(event.durationMs) || '0ms'}`,
        formatTokens(event.tokens ?? entry.tokens),
      ].filter(Boolean).join(' · ');
      let line = `  ${Colors.green}${Icons.check}${Colors.reset} ${Colors.bold}${entry.agentName}${Colors.reset} ${Colors.dim}— ${meta}${Colors.reset}\r\n`;
      if (event.summary) {
        line += `    ${Colors.dim}└ ${event.summary.split('\n')[0]}${Colors.reset}\r\n`;
      }
      this.scrollOut(line);
      return;
    }

    if (event.type === 'failed') {
      const firstLine = event.error.split('\n')[0];
      this.scrollOut(
        `  ${Colors.red}${Icons.cross}${Colors.reset} ${Colors.bold}${entry.agentName}${Colors.reset} ${Colors.dim}— failed after ${formatDuration(event.durationMs) || '0ms'}${Colors.reset}\r\n`
        + `    ${Colors.red}└ ${firstLine}${Colors.reset}\r\n`,
      );
    }
  }

  setCurrentTool(agentId: string, tool: string): void {
    const entry = this.agents.get(agentId);
    if (entry) entry.currentTool = tool;
  }

  clearAll(): void {
    this.agents.clear();
  }

  tick(): void {
    this.spinnerFrame = (this.spinnerFrame + 1) % Icons.spinner.length;
  }

  isAnimated(): boolean {
    return this.agents.size > 0;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const spinner = Icons.spinner[this.spinnerFrame];

    for (const entry of this.agents.values()) {
      const elapsed = formatDuration(Date.now() - entry.startedAt) || '0s';
      const title = `${Colors.primary}●${Colors.reset} ${Colors.bold}${entry.agentName}${Colors.reset} ${Colors.dim}— ${entry.task}${Colors.reset}`;
      lines.push(truncateVisible(title, width));

      const meta = [
        `${spinner} Running ${elapsed}`,
        formatTokens(entry.tokens),
      ].filter(Boolean).join(' · ');
      lines.push(`  ${Colors.dim}${truncateVisible(meta, Math.max(1, width - 2))}${Colors.reset}`);

      if (entry.currentTool) {
        lines.push(`  ${Colors.muted}└ ${truncateVisible(entry.currentTool, Math.max(1, width - 4))}${Colors.reset}`);
      }
    }

    if (lines.length > 0) lines.push('');
    return lines;
  }
}
```

Note: `truncateVisible` from `src/ui/cast-design/cli-renderer` operates on visible (ANSI-stripped) width — verify its signature before use; if it returns the truncated plain string, wrap colors around the truncated text instead (match how `formatSuggestionLine` in `smart-input.ts` does it).

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --test -r ts-node/register src/ui/live-region/agent-tree-block.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit (with user approval)**

```bash
git add src/ui/live-region/agent-tree-block.ts src/ui/live-region/agent-tree-block.spec.ts
git commit -m "feat(ui): add AgentTreeBlock for live sub-agent visibility"
```

---

### Task 8: Diff rendering for edit/write tools

**Files:**
- Create: `src/ui/cast-design/diff-renderer.ts`
- Test: `src/ui/cast-design/diff-renderer.spec.ts`
- Modify: `src/modules/repl/services/tool-ui.service.ts`

`edit_file` input carries `old_string`/`new_string` (verify exact field names in the edit tool definition — `grep -rn "old_string\|oldString" src/modules/runtime src/modules/core --include="*.ts" | head` — and adjust); `write_file` carries `content`. On completion, render a colored unified diff under the tool block.

The spec's other tool-UI item — humanized args on the call line — already exists: `getToolInputSummary` in `src/ui/cast-design/tool-call-details.ts` is rendered as the second box row by `renderToolCallBlock`. No work needed beyond confirming it displays for the tools you touch.

- [ ] **Step 1: Write failing tests**

```typescript
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderDiffLines } from './diff-renderer';
import { stripAnsi } from './cli-renderer';

describe('renderDiffLines', () => {
  test('shows removed lines with - and added with +', () => {
    const lines = renderDiffLines('a\nb\nc', 'a\nX\nc').map(stripAnsi);
    assert.deepEqual(lines, ['  a', '- b', '+ X', '  c']);
  });

  test('pure addition (write_file on new file)', () => {
    const lines = renderDiffLines('', 'one\ntwo').map(stripAnsi);
    assert.deepEqual(lines, ['+ one', '+ two']);
  });

  test('caps output and reports remainder', () => {
    const oldText = Array.from({ length: 60 }, (_, i) => `l${i}`).join('\n');
    const lines = renderDiffLines(oldText, '', 20).map(stripAnsi);
    assert.equal(lines.length, 21);
    assert.match(lines[20], /… 40 more lines/);
  });

  test('context collapses for large unchanged spans', () => {
    const mid = Array.from({ length: 30 }, (_, i) => `same${i}`).join('\n');
    const lines = renderDiffLines(`start\n${mid}\nend`, `START\n${mid}\nend`).map(stripAnsi);
    assert.equal(lines.some((l) => l.includes('⋮')), true);
    assert.equal(lines.length < 20, true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `node --test -r ts-node/register src/ui/cast-design/diff-renderer.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement diff renderer**

```typescript
import { diffLines } from 'diff';
import { Colors } from '../../modules/repl/utils/theme';

const CONTEXT = 2;

/**
 * Renders a compact colored line diff. Unchanged spans longer than
 * 2*CONTEXT+1 collapse to a '⋮' marker. Output capped at maxLines with a
 * trailing '… N more lines' marker.
 */
export function renderDiffLines(
  oldText: string,
  newText: string,
  maxLines = 40,
): string[] {
  const parts = diffLines(oldText, newText);
  const raw: string[] = [];

  for (const part of parts) {
    const lines = part.value.replace(/\n$/, '').split('\n');
    if (part.added) {
      for (const line of lines) raw.push(`${Colors.green}+ ${line}${Colors.reset}`);
    } else if (part.removed) {
      for (const line of lines) raw.push(`${Colors.red}- ${line}${Colors.reset}`);
    } else {
      if (lines.length > CONTEXT * 2 + 1) {
        for (const line of lines.slice(0, CONTEXT)) raw.push(`${Colors.dim}  ${line}${Colors.reset}`);
        raw.push(`${Colors.dim}  ⋮${Colors.reset}`);
        for (const line of lines.slice(-CONTEXT)) raw.push(`${Colors.dim}  ${line}${Colors.reset}`);
      } else {
        for (const line of lines) raw.push(`${Colors.dim}  ${line}${Colors.reset}`);
      }
    }
  }

  if (raw.length > maxLines) {
    const remainder = raw.length - maxLines;
    return [...raw.slice(0, maxLines), `${Colors.dim}… ${remainder} more lines${Colors.reset}`];
  }
  return raw;
}
```

If the first diff test fails because leading-edge context handling differs (`diffLines` keeps trailing newlines inside `value`), normalize with `part.value.replace(/\n$/, '')` exactly as shown — that is already in the code above.

- [ ] **Step 4: Run diff tests, verify they pass**

Run: `node --test -r ts-node/register src/ui/cast-design/diff-renderer.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire into ToolUiService**

In `src/modules/repl/services/tool-ui.service.ts`:

1. Extend `ToolCallRecord` with `input?: unknown;`.
2. In `handle()` for `started` events, store the input: after `const state = buildToolCallRenderState(...)`, push `{ ...state, renderedLineCount: rendered.lineCount, input: event.input }`.
3. After a `completed` event for `edit_file`/`write_file`, append a diff block to the output. Add at the end of `handle()` (after the record update):

```typescript
if (event.type === 'completed' && isFileMutationTool(event.toolName)) {
  const diffContent = buildDiffContent(event.toolName, existing?.input);
  if (diffContent) {
    this.output.write(diffContent);
  }
}
```

4. Add module-level helpers in the same file:

```typescript
import { renderDiffLines } from '../../../ui/cast-design/diff-renderer';

function isFileMutationTool(toolName: string): boolean {
  return toolName === 'edit_file' || toolName === 'write_file';
}

function buildDiffContent(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  let oldText: string;
  let newText: string;

  if (toolName === 'edit_file') {
    if (typeof record.old_string !== 'string' || typeof record.new_string !== 'string') return null;
    oldText = record.old_string;
    newText = record.new_string;
  } else {
    if (typeof record.content !== 'string') return null;
    oldText = '';
    newText = record.content;
  }

  const lines = renderDiffLines(oldText, newText, 40);
  if (lines.length === 0) return null;
  return lines.map((l) => `    ${l}`).join('\r\n') + '\r\n';
}
```

(Adjust `old_string`/`new_string`/`content` to the actual field names found in Step 0 grep.)

- [ ] **Step 6: Verify**

Run: `npm run typecheck && node --test -r ts-node/register src/ui/cast-design/diff-renderer.spec.ts`
Expected: both PASS. Manual check: `npm run start:dev`, ask the agent to edit a file, confirm a colored diff appears under the Edit tool block.

- [ ] **Step 7: Commit (with user approval)**

```bash
git add src/ui/cast-design/diff-renderer.ts src/ui/cast-design/diff-renderer.spec.ts src/modules/repl/services/tool-ui.service.ts
git commit -m "feat(ui): render colored diffs for edit/write tool completions"
```

---

### Task 9: Agent event emission from DeepAgentService

**Files:**
- Modify: `src/modules/core/services/deep-agent.service.ts` (two delegation paths: ~lines 1799–1804, 1839–1842, 1862–1865 and ~1953, 1994, 2017)

The generator already detects delegation at these sites (`isDelegationTool` + `startDelegatedAgentRun`). Add `agent` chunk yields beside them. There is no test harness for this 2353-line service's stream; verification is `npm run smoke:agentic-runtime-v2` + typecheck.

- [ ] **Step 1: Track delegated runs with metadata**

Both paths keep a `activeDelegatedAgentRuns` map of `localToolKey → runId`. Extend the map value to carry render metadata. Find the declaration (`activeDelegatedAgentRuns = new Map`, both code paths) and change to:

```typescript
const activeDelegatedAgentRuns = new Map<string, { runId: string; agentName: string; task: string; startedAt: number }>();
```

- [ ] **Step 2: Yield `spawned` at start sites (~1799 and ~1953)**

Replace (first path shown; mirror at the second site with its `toolInput` variable):

```typescript
if (this.isDelegationTool(runtimeEvent.toolName)) {
  const run = this.startDelegatedAgentRun(runtimeEvent.input);
  if (run) {
    activeDelegatedAgentRuns.set(lastLocalToolKey, run.id);
  }
}
```

with:

```typescript
if (this.isDelegationTool(runtimeEvent.toolName)) {
  const run = this.startDelegatedAgentRun(runtimeEvent.input);
  const agentName = this.getDelegatedAgentName(runtimeEvent.input);
  const task = this.getDelegatedAgentTask(runtimeEvent.input);
  const agentId = run?.id ?? lastLocalToolKey;
  activeDelegatedAgentRuns.set(lastLocalToolKey, {
    runId: agentId,
    agentName,
    task,
    startedAt: Date.now(),
  });
  yield {
    kind: 'agent',
    event: { type: 'spawned', agentId, agentName, task },
  };
}
```

- [ ] **Step 3: Yield `completed` at completion sites (~1839 and ~1994)**

Replace:

```typescript
if (this.isDelegationTool(toolName)) {
  this.completeDelegatedAgentRun(activeDelegatedAgentRuns.get(localToolKey), output);
  activeDelegatedAgentRuns.delete(localToolKey);
}
```

with:

```typescript
if (this.isDelegationTool(toolName)) {
  const delegated = activeDelegatedAgentRuns.get(localToolKey);
  this.completeDelegatedAgentRun(delegated?.runId, output);
  activeDelegatedAgentRuns.delete(localToolKey);
  if (delegated) {
    yield {
      kind: 'agent',
      event: {
        type: 'completed',
        agentId: delegated.runId,
        durationMs: Date.now() - delegated.startedAt,
        summary: output ? output.split('\n')[0].slice(0, 120) : undefined,
      },
    };
  }
}
```

- [ ] **Step 4: Yield `failed` at failure sites (~1862 and ~2017)**

Replace:

```typescript
if (this.isDelegationTool(toolName)) {
  this.failDelegatedAgentRun(activeDelegatedAgentRuns.get(localToolKey), new Error(message));
  activeDelegatedAgentRuns.delete(localToolKey);
}
```

with:

```typescript
if (this.isDelegationTool(toolName)) {
  const delegated = activeDelegatedAgentRuns.get(localToolKey);
  this.failDelegatedAgentRun(delegated?.runId, new Error(message));
  activeDelegatedAgentRuns.delete(localToolKey);
  if (delegated) {
    yield {
      kind: 'agent',
      event: {
        type: 'failed',
        agentId: delegated.runId,
        durationMs: Date.now() - delegated.startedAt,
        error: message,
      },
    };
  }
}
```

At the second-path failure site the existing call passes `error` instead of `new Error(message)` — keep the existing argument, only restructure to capture `delegated` first.

- [ ] **Step 5: Suppress the redundant `tool` chunk for delegation calls**

The `task` tool still also yields a normal `tool` chunk (started/completed), which would duplicate the agent tree. In the started/completed/failed yield sites for tool chunks, skip when `this.isDelegationTool(toolName)`:

```typescript
if (!this.isDelegationTool(runtimeEvent.toolName)) {
  yield { kind: 'tool', event: { /* unchanged */ } };
}
```

Apply the same guard at all six tool-chunk yield sites in both paths (started/completed/failed × 2 paths). The delegated-run bookkeeping (`recordLocalToolCall`, `lastToolOutputs`) stays unconditional.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.
Run: `npm run smoke:agentic-runtime-v2`
Expected: PASS (smoke validates agent-event plumbing end to end).

- [ ] **Step 7: Commit (with user approval)**

```bash
git add src/modules/core/services/deep-agent.service.ts
git commit -m "feat(core): emit agent stream chunks for delegated sub-agent runs"
```

---

### Task 10: SmartInput refactor onto the live region

**Files:**
- Modify: `src/modules/repl/services/smart-input.ts` (major)
- Modify: `src/modules/repl/services/repl.service.ts` (construction site + agent chunk routing)
- Test: extend existing repl specs if present; primary verification is the unit tests of Tasks 2–7 plus manual run

This is the riskiest task. The external `ISmartInput` interface does not change, so `repl.service.ts` call sites keep working. Internals change:

- [ ] **Step 1: Replace buffer/cursor fields with MultilineBuffer and the blocks**

In `SmartInput`:
- Delete fields: `buffer`, `cursor`, `renderedLines`, `renderedInputRows`, `cursorRow`.
- Add fields:

```typescript
private readonly decoder = new KeyDecoder();
private readonly inputBox: InputBoxBlock;
private readonly footer = new FooterBlock();
private compositor: LiveRegionCompositor;
```

- Constructor additions:

```typescript
this.inputBox = new InputBoxBlock({ placeholder: opts.placeholder });
this.compositor = opts.compositor; // new required option
this.compositor.addBlock(this.inputBox);
this.compositor.addBlock(this.footer);
```

`SmartInputOptions` gains `compositor: LiveRegionCompositor;` and drops `prompt`/`promptVisibleLen` (the box renders its own label). Update the construction site in `repl.service.ts` (search for `new SmartInput(`): create `const compositor = new LiveRegionCompositor({ write: (s) => process.stdout.write(s), get columns() { return process.stdout.columns || 80; }, isTTY: Boolean(process.stdout.isTTY) });` and pass it. Keep a reference on the repl service: `this.compositor = compositor`.

- [ ] **Step 2: Rewrite `handleInputData` on top of KeyDecoder**

Replace the body of `handleInputData` with a loop over `this.decoder.feed(data)`:

```typescript
private handleInputData(data: string) {
  let needsRender = false;
  let bufferChanged = false;

  for (const key of this.decoder.feed(data)) {
    switch (key.type) {
    case 'char':
      this.inputBox.buffer.insert(key.char);
      needsRender = true;
      bufferChanged = true;
      break;
    case 'paste':
      this.inputBox.buffer.insert(key.text);
      needsRender = true;
      bufferChanged = true;
      break;
    case 'newline':
      this.inputBox.buffer.newline();
      needsRender = true;
      bufferChanged = true;
      break;
    case 'enter':
      this.keyEnter();
      break;
    case 'up':
      this.keyUp();
      needsRender = true;
      break;
    case 'down':
      this.keyDown();
      needsRender = true;
      break;
    case 'left':
      this.inputBox.buffer.moveLeft();
      needsRender = true;
      break;
    case 'right':
      this.inputBox.buffer.moveRight();
      needsRender = true;
      break;
    case 'home':
      this.inputBox.buffer.moveHome();
      needsRender = true;
      break;
    case 'end':
      this.inputBox.buffer.moveEnd();
      needsRender = true;
      break;
    case 'backspace':
      this.inputBox.buffer.backspace();
      needsRender = true;
      bufferChanged = true;
      break;
    case 'delete':
      this.inputBox.buffer.deleteForward();
      needsRender = true;
      bufferChanged = true;
      break;
    case 'tab':
      this.keyTab();
      needsRender = true;
      break;
    case 'shift-tab':
      this.keyShiftTab();
      break;
    case 'ctrl':
      ({ needsRender, bufferChanged } = this.handleCtrl(key.key, needsRender, bufferChanged));
      break;
    }
  }

  if (needsRender) {
    if (bufferChanged) this.computeSuggestions();
    this.refreshLiveRegion();
  }
}

private handleCtrl(key: string, needsRender: boolean, bufferChanged: boolean) {
  switch (key) {
  case 'c': this.keyCtrlC(); break;
  case 'd':
    if (this.inputBox.buffer.isEmpty) {
      this.compositor.clear();
      process.stdout.write('\r\n');
      this.opts.onExit();
    }
    break;
  case 'l':
    process.stdout.write('\x1b[2J\x1b[H');
    needsRender = true;
    break;
  case 'a': this.inputBox.buffer.moveHome(); needsRender = true; break;
  case 'e': this.inputBox.buffer.moveEnd(); needsRender = true; break;
  case 'u': this.inputBox.buffer.killToStart(); needsRender = true; bufferChanged = true; break;
  case 'k': this.inputBox.buffer.killToEnd(); needsRender = true; bufferChanged = true; break;
  case 'w': this.inputBox.buffer.deleteWordBack(); needsRender = true; bufferChanged = true; break;
  case 'o':
    if (this.opts.onExpandToolOutput) {
      this.opts.onExpandToolOutput();
      needsRender = true;
    }
    break;
  }
  return { needsRender, bufferChanged };
}
```

`keyUp`/`keyDown` adapt: suggestions first, then `this.inputBox.buffer.moveUp()`, and only when that returns `false` fall back to history navigation (history entries load via `this.inputBox.buffer.setText(entry)`).

- [ ] **Step 3: Backslash+Enter and submit**

In `keyEnter()`:

```typescript
private keyEnter() {
  if (this.selectedIndex >= 0 && this.suggestions.length > 0) {
    this.acceptSuggestion();
    this.computeSuggestions();
    this.refreshLiveRegion();
    return;
  }

  const buf = this.inputBox.buffer;
  const lines = buf.getLines();
  const { row } = buf.cursor;
  // Backslash continuation: line ends with '\' and cursor is at its end
  if (lines[row].endsWith('\\') && buf.cursor.col === lines[row].length) {
    buf.backspace(); // remove the backslash
    buf.newline();
    this.refreshLiveRegion();
    return;
  }

  this.submitLine();
}
```

`submitLine()` becomes:

```typescript
private submitLine() {
  const line = this.inputBox.buffer.text;
  const firstLine = line.split('\n')[0];
  const extraLines = line.split('\n').length - 1;
  const echo = line.trim()
    ? `${Colors.dim}› ${firstLine}${extraLines > 0 ? ` (+${extraLines} lines)` : ''}${Colors.reset}\r\n`
    : '\r\n';

  this.inputBox.buffer.clear();
  this.suggestions = [];
  this.selectedIndex = -1;
  this.historyIndex = -1;
  this.footer.setSuggestions([], -1);
  this.compositor.scrollOut(echo);

  if (line.trim()) {
    this.history.unshift(line);
    if (this.history.length > MAX_HISTORY) this.history.pop();
    appendHistory(line.replace(/\n/g, '\\n'));
  }

  this.opts.onSubmit(line);
}
```

History file stores newlines escaped as `\\n`; `loadHistory()` reverses it: `.map((l) => l.replace(/\\n/g, '\n'))`.

- [ ] **Step 4: Replace render plumbing**

```typescript
private refreshLiveRegion() {
  this.footer.setSuggestions(this.suggestions, this.selectedIndex);
  if (this.suggestions.length === 0 && this.opts.getFooterLines) {
    // legacy footer lines API → join into status hints
    const legacy = this.opts.getFooterLines();
    this.footer.setStatus({ mode: '', model: '', hints: legacy.length > 0 ? [legacy[0]] : [] });
  }
  const width = Math.max(1, process.stdout.columns || 80);
  const pos = this.inputBox.cursorPosition(width);
  // agent tree (if present) renders above the input box; compositor handles offsets
  this.compositor.setCursor(this.inputBox.id, pos.row, pos.col);
  this.compositor.repaint();
}
```

Note: `compositor.setCursor(blockId, row, col)` takes block-relative coordinates (row 0 = the block's first line), matching what `cursorPosition` returns — see the Task 5 implementation.

Also register a resize handler in `start()` (replacing the old one that only updated `terminalWidth`):

```typescript
process.stdout.on('resize', () => this.refreshLiveRegion());
```

Then:
- `render()` → delete. All callers call `refreshLiveRegion()`.
- `clearRenderedBlock()` → replace with `this.compositor.clear()`.
- `buildInputLines()`, `formatInputBandLine()`, `formatPlaceholderLine()`, `calculateCursorPosition()`, `countInputRows()`, `clearSuggestions()` rendering math → delete. (`formatSuggestionLine` logic moved to FooterBlock in Task 6.)
- `printExternal(text)` → body becomes `this.compositor.scrollOut(text)` (with the existing passthrough when paused/question mode).
- `writeOutputLine(line)` → `this.compositor.scrollOut(line + '\r\n')` (same passthrough guards).
- `rewriteLinesAbove(lineCount, content)` → unchanged ANSI logic, but call `this.compositor.clear()` before writing and `this.refreshLiveRegion()` after (replacing the old clear/render pair).
- `beginExternalOutput()` → `this.compositor.clear()`; `endExternalOutput()` → `this.refreshLiveRegion()`.
- `pause()`/`resume()`/`showPrompt()`/`enterPassiveMode()` keep their roles; rendering calls swap to `compositor.clear()` / `refreshLiveRegion()`.
- `question` and `choice` modes: call `this.compositor.clear()` on entry (before writing their own prompts) and `this.refreshLiveRegion()` when returning to input mode. Their internal logic is otherwise untouched.
- `start()`: after raw mode setup, write bracketed-paste enable `\x1b[?2004h`; `destroy()`: write `\x1b[?2004l` (and kitty pop — Task 11).

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint:check && npm test`
Expected: PASS. Some existing repl specs may assert old rendering internals — update them to the new API (they should construct SmartInput with a fake compositor: `{ write: () => {}, isTTY: false, columns: 80 }` wrapped in `new LiveRegionCompositor(...)`).

Manual run: `npm run start:dev`
- Type text → bordered box renders, cursor correct.
- Ctrl+J → newline, box grows.
- `\` then Enter → newline.
- Paste multiline text → inserts, does not submit.
- Enter → submits, dim echo line, agent responds.
- `/` → suggestions under box; Tab/arrows/Enter accept.
- History up/down on first/last row.
- Ctrl+C clears; double Ctrl+C exits; Ctrl+D on empty exits.
- Resize terminal → no corruption.

- [ ] **Step 6: Commit (with user approval)**

```bash
git add src/modules/repl/services/smart-input.ts src/modules/repl/services/repl.service.ts
git commit -m "refactor(repl): move SmartInput onto live-region compositor with multiline input"
```

---

### Task 11: REPL wiring — agent tree, kitty startup, footer hints

**Files:**
- Modify: `src/modules/repl/services/repl.service.ts`

- [ ] **Step 1: Register AgentTreeBlock**

Where the compositor is created (Task 10 Step 1), add:

```typescript
this.agentTree = new AgentTreeBlock((content) => this.compositor.scrollOut(content));
this.compositor.addBlock(this.agentTree, 0); // index 0: above input box
this.compositor.onTick(() => this.agentTree.tick());
```

Add the field `private agentTree!: AgentTreeBlock;`.

- [ ] **Step 2: Route agent chunks in `handleStreamChunk`**

In `handleStreamChunk` (repl.service.ts ~line 1417), before the `chunk.kind === 'tool'` branch:

```typescript
if (chunk.kind === 'agent') {
  this.agentTree.handle(chunk.event);
  this.compositor.repaint();
  return;
}
```

In the `tool` branch, route sub-agent tool events to the tree instead of the transcript:

```typescript
if (chunk.kind === 'tool') {
  if (chunk.event.agentId) {
    if (chunk.event.type === 'started') {
      const summary = getToolInputSummary(chunk.event.toolName, chunk.event.input);
      this.agentTree.setCurrentTool(
        chunk.event.agentId,
        `${getToolDisplayName(chunk.event.toolName)} ${summary}`.trim(),
      );
      this.compositor.repaint();
    }
    return;
  }
  // ...existing main-agent tool handling unchanged
}
```

Import `getToolInputSummary`/`getToolDisplayName` from `../../../ui/cast-design/tool-call-details`.

(Today nothing emits `agentId` on tool events — sub-agent runtimes don't stream their tool calls into the main generator. The plumbing is in place; when sub-agent runtimes gain event forwarding, only the emitter changes.)

- [ ] **Step 3: Teardown safety**

In the `finally` block of the chat loop (repl.service.ts ~line 1468), add:

```typescript
this.agentTree.clearAll();
this.compositor.repaint();
```

This guarantees a sub-agent that never reports `completed` can't wedge the tree (spec requirement).

- [ ] **Step 4: Kitty detection at startup + footer hints**

At REPL startup (where `smartInput.start()` is called), before starting input:

```typescript
import { detectKittyProtocol, KITTY_ENABLE, KITTY_DISABLE } from '../../../ui/live-region/kitty-protocol';

this.kittySupported = await detectKittyProtocol({
  stdin: process.stdin,
  write: (s) => process.stdout.write(s),
  timeoutMs: 50,
});
if (this.kittySupported) {
  process.stdout.write(KITTY_ENABLE);
}
```

Important ordering: run detection BEFORE `smartInput.start()` attaches its data handler (raw mode must be enabled for the reply to arrive unbuffered — set `process.stdin.setRawMode(true)` and `process.stdin.resume()` first; `smartInput.start()` keeps them on).

On shutdown (where `smartInput.destroy()` is called, and in any exit handler):

```typescript
if (this.kittySupported) {
  process.stdout.write(KITTY_DISABLE);
}
```

Footer hint wiring — wherever the footer status is set (Task 10 `refreshLiveRegion` or a repl-level call), include:

```typescript
const newlineHint = this.kittySupported ? 'Ctrl+Enter newline' : 'Ctrl+J newline';
this.smartInput.setFooterStatus({ mode: currentModeLabel, model: currentModelLabel, hints: [newlineHint] });
```

Add `setFooterStatus(status: FooterStatus)` to `ISmartInput` and `SmartInput` (delegates to `this.footer.setStatus(status)` + `refreshLiveRegion()`). Pull `currentModeLabel`/`currentModelLabel` from the same sources the existing `getFooterLines` callback uses (search `getFooterLines` construction in repl.service.ts and reuse those values).

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint:check && npm test`
Expected: PASS

Manual: `npm run start:dev`, delegate a task (`use the coder agent to ...`) → agent tree appears above the input box, spinner animates, completion scrolls out a `✓` line. Footer shows mode · model · newline hint.

Run: `npm run smoke:agentic-runtime-v2`
Expected: PASS

- [ ] **Step 6: Commit (with user approval)**

```bash
git add src/modules/repl/services/repl.service.ts src/modules/repl/services/smart-input.ts
git commit -m "feat(repl): live sub-agent tree, kitty protocol startup, footer hints"
```

---

### Task 12: Final verification sweep

**Files:** none new

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS, including all new spec files (Tasks 2–8).

- [ ] **Step 2: Types and lint**

Run: `npm run typecheck && npm run lint:check`
Expected: PASS

- [ ] **Step 3: Smokes**

Run: `npm run smoke:agentic-runtime-v2`
Expected: PASS

- [ ] **Step 4: Manual checklist (run `npm run start:dev`)**

- [ ] Bordered input box with `›` label and placeholder
- [ ] Footer shows mode · model · newline hint; suggestions replace it while typing `/`
- [ ] Ctrl+J inserts newline in every terminal; Ctrl+Enter works in kitty/WezTerm/Ghostty
- [ ] `\` + Enter inserts newline
- [ ] Multiline paste inserts without submitting
- [ ] Enter submits; echo line `› first line (+N lines)`
- [ ] Edit/Write tool calls show colored diffs
- [ ] Delegated agent shows live tree entry; completion scrolls out `✓` summary
- [ ] Ctrl+C / double Ctrl+C / Ctrl+D behaviors intact
- [ ] `/remote` still mirrors output (stdout interception unaffected)
- [ ] Resize during input does not corrupt the screen
- [ ] Narrow terminal (<40 cols) falls back to plain prompt

- [ ] **Step 5: Update README**

Add to the README feature table: multiline input keys and sub-agent live view. Two rows, follow existing table format.

- [ ] **Step 6: Final commit (with user approval)**

```bash
git add README.md
git commit -m "docs: document multiline input and live sub-agent view"
```
