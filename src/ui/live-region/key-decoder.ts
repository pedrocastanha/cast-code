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
            // kitty modifiers = 1 + bitmask (shift=1, alt=2, ctrl=4):
            // Shift+Enter inserts a newline, anything else submits
            const shiftHeld = ((mod - 1) & 1) === 1;
            events.push(shiftHeld ? { type: 'newline' } : { type: 'enter' });
          }
          continue; // other CSI-u (incl. ?-flag replies) swallowed
        }
        if (final === '~') {
          if (params === '3') {
            events.push({ type: 'delete' });
            continue;
          }
          // xterm modifyOtherKeys (formatOtherKeys=0): ESC [ 27 ; <mod> ; <codepoint> ~
          const parts = params.split(';');
          if (parts[0] === '27' && parts[2] === '13') {
            const mod = Number.parseInt(parts[1] || '1', 10);
            // modifiers = 1 + bitmask (shift=1, alt=2, ctrl=4), same as kitty:
            // Shift+Enter inserts a newline, anything else submits
            const shiftHeld = ((mod - 1) & 1) === 1;
            events.push(shiftHeld ? { type: 'newline' } : { type: 'enter' });
          }
          continue; // other ~ sequences swallowed
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
