const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

export interface Suggestion {
  text: string;
  display: string;
  description?: string;
}

export interface SmartInputOptions {
  prompt: string;
  promptVisibleLen: number;
  getCommandSuggestions: (input: string) => Suggestion[];
  getMentionSuggestions: (partial: string) => Suggestion[];
  onSubmit: (line: string) => void;
  onCancel: () => void;
  onExit: () => void;
  onExpandToolOutput?: () => void;
}

export class SmartInput {
  private buffer = '';
  private cursor = 0;

  private history: string[] = [];
  private historyIndex = -1;
  private savedBuffer = '';

  private suggestions: Suggestion[] = [];
  private selectedIndex = -1;
  private renderedLines = 0;

  private mode: 'input' | 'passive' | 'question' = 'input';
  private questionResolve: ((answer: string) => void) | null = null;
  private questionBuffer = '';

  private prompt: string;
  private promptLen: number;
  private opts: SmartInputOptions;

  private dataHandler: ((data: string) => void) | null = null;

  constructor(opts: SmartInputOptions) {
    this.opts = opts;
    this.prompt = opts.prompt;
    this.promptLen = opts.promptVisibleLen;
  }

  start() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    this.dataHandler = (data: string) => this.handleData(data);
    process.stdin.on('data', this.dataHandler);

    this.mode = 'input';
    this.render();
  }

  enterPassiveMode() {
    this.mode = 'passive';
    this.clearSuggestions();
  }

  exitPassiveMode() {
    this.mode = 'input';
  }

  showPrompt() {
    this.buffer = '';
    this.cursor = 0;
    this.suggestions = [];
    this.selectedIndex = -1;
    this.mode = 'input';
    this.render();
  }

  async question(query: string): Promise<string> {
    this.mode = 'question';
    this.questionBuffer = '';
    process.stdout.write(query + ' ');

    return new Promise<string>((resolve) => {
      this.questionResolve = resolve;
    });
  }

  async askChoice(
    message: string,
    choices: { key: string; label: string; description?: string }[],
  ): Promise<string> {
    process.stdout.write(`\r\n${C.cyan}${message}${C.reset}\r\n\r\n`);
    choices.forEach((ch, i) => {
      const desc = ch.description ? `${C.dim} - ${ch.description}${C.reset}` : '';
      process.stdout.write(`  ${C.white}${i + 1}.${C.reset} ${C.bold}${ch.label}${C.reset}${desc}\r\n`);
    });
    process.stdout.write('\r\n');

    while (true) {
      const answer = await this.question(`${C.yellow}Choose (1-${choices.length}):${C.reset}`);
      const idx = parseInt(answer) - 1;
      if (idx >= 0 && idx < choices.length) {
        return choices[idx].key;
      }
      process.stdout.write(`${C.red}  Invalid choice, try again.${C.reset}\r\n`);
    }
  }

  destroy() {
    this.clearSuggestions();
    if (this.dataHandler) {
      process.stdin.removeListener('data', this.dataHandler);
      this.dataHandler = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }

  private handleData(data: string) {
    if (this.mode === 'passive') {
      for (const ch of data) {
        if (ch.charCodeAt(0) === 0x03) {
          this.opts.onCancel();
        }
      }
      return;
    }

    if (this.mode === 'question') {
      this.handleQuestionData(data);
      return;
    }

    this.handleInputData(data);
  }

  private handleQuestionData(data: string) {
    const write = (s: string) => process.stdout.write(s);

    for (let i = 0; i < data.length; i++) {
      const code = data.charCodeAt(i);

      if (code === 0x0d || code === 0x0a) {
        write('\r\n');
        const resolve = this.questionResolve;
        const answer = this.questionBuffer;
        this.questionResolve = null;
        this.questionBuffer = '';
        this.mode = 'input';
        if (resolve) resolve(answer);
        return;
      }

      if (code === 0x7f || code === 0x08) {
        if (this.questionBuffer.length > 0) {
          this.questionBuffer = this.questionBuffer.slice(0, -1);
          write('\b \b');
        }
        continue;
      }

      if (code === 0x03) {
        write('\r\n');
        const resolve = this.questionResolve;
        this.questionResolve = null;
        this.questionBuffer = '';
        this.mode = 'input';
        if (resolve) resolve('');
        return;
      }

      if (code >= 0x20) {
        this.questionBuffer += data[i];
        write(data[i]);
      }
    }
  }

  private handleInputData(data: string) {
    let needsRender = false;
    let bufferChanged = false;
    let i = 0;

    while (i < data.length) {
      if (data[i] === '\x1b' && data[i + 1] === '[') {
        const rest = data.slice(i);

        if (rest.startsWith('\x1b[A'))  { this.keyUp();    i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[B'))  { this.keyDown();  i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[C'))  { this.keyRight(); i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[D'))  { this.keyLeft();  i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[H'))  { this.cursor = 0; i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[F'))  { this.cursor = this.buffer.length; i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[3~')) { this.keyDelete(); i += 4; needsRender = true; bufferChanged = true; continue; }

        i++;
        continue;
      }

      const code = data.charCodeAt(i);

      switch (code) {
        case 0x0d:
        case 0x0a:
          this.keyEnter();
          i++;
          continue;

        case 0x09:
          this.keyTab();
          needsRender = true;
          break;

        case 0x7f:
        case 0x08:
          this.keyBackspace();
          needsRender = true;
          bufferChanged = true;
          break;

        case 0x03:
          this.keyCtrlC();
          i++;
          continue;

        case 0x04:
          if (this.buffer.length === 0) {
            this.clearSuggestions();
            process.stdout.write('\r\n');
            this.opts.onExit();
            return;
          }
          break;

        case 0x0c:
          this.clearSuggestions();
          process.stdout.write('\x1b[2J\x1b[H');
          needsRender = true;
          break;

        case 0x15:
          this.buffer = this.buffer.slice(this.cursor);
          this.cursor = 0;
          needsRender = true;
          bufferChanged = true;
          break;

        case 0x0b:
          this.buffer = this.buffer.slice(0, this.cursor);
          needsRender = true;
          bufferChanged = true;
          break;

        case 0x01:
          this.cursor = 0;
          needsRender = true;
          break;

        case 0x05:
          this.cursor = this.buffer.length;
          needsRender = true;
          break;

        case 0x17:
          this.deleteWordBack();
          needsRender = true;
          bufferChanged = true;
          break;

        case 0x0f:
          if (this.opts.onExpandToolOutput) {
            this.clearSuggestions();
            process.stdout.write('\r\n');
            this.opts.onExpandToolOutput();
            needsRender = true;
          }
          break;

        default:
          if (code >= 0x20) {
            this.buffer =
              this.buffer.slice(0, this.cursor) +
              data[i] +
              this.buffer.slice(this.cursor);
            this.cursor++;
            needsRender = true;
            bufferChanged = true;
          }
      }

      i++;
    }

    if (needsRender) {
      if (bufferChanged) {
        this.computeSuggestions();
      }
      this.render();
    }
  }

  private keyUp() {
    if (this.suggestions.length > 0) {
      this.selectedIndex =
        this.selectedIndex <= 0
          ? this.suggestions.length - 1
          : this.selectedIndex - 1;
    } else {
      if (this.historyIndex === -1) this.savedBuffer = this.buffer;
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this.buffer = this.history[this.historyIndex];
        this.cursor = this.buffer.length;
      }
    }
  }

  private keyDown() {
    if (this.suggestions.length > 0) {
      this.selectedIndex =
        this.selectedIndex >= this.suggestions.length - 1
          ? 0
          : this.selectedIndex + 1;
    } else {
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.buffer = this.history[this.historyIndex];
        this.cursor = this.buffer.length;
      } else if (this.historyIndex === 0) {
        this.historyIndex = -1;
        this.buffer = this.savedBuffer;
        this.cursor = this.buffer.length;
      }
    }
  }

  private keyLeft()  { if (this.cursor > 0) this.cursor--; }
  private keyRight() { if (this.cursor < this.buffer.length) this.cursor++; }

  private keyBackspace() {
    if (this.cursor > 0) {
      this.buffer =
        this.buffer.slice(0, this.cursor - 1) +
        this.buffer.slice(this.cursor);
      this.cursor--;
    }
  }

  private keyDelete() {
    if (this.cursor < this.buffer.length) {
      this.buffer =
        this.buffer.slice(0, this.cursor) +
        this.buffer.slice(this.cursor + 1);
    }
  }

  private keyEnter() {
    if (this.selectedIndex >= 0 && this.suggestions.length > 0) {
      this.acceptSuggestion();
      this.computeSuggestions();
      this.render();
    } else {
      this.submitLine();
    }
  }

  private keyTab() {
    if (this.suggestions.length > 0) {
      if (this.selectedIndex < 0) {
        this.selectedIndex = 0;
        this.acceptSuggestion();
        this.computeSuggestions();
      } else {
        this.acceptSuggestion();
        this.computeSuggestions();
      }
    }
  }

  private lastCtrlCTime = 0;

  private keyCtrlC() {
    if (this.buffer.length > 0) {
      this.buffer = '';
      this.cursor = 0;
      this.suggestions = [];
      this.selectedIndex = -1;
      this.lastCtrlCTime = Date.now();
      this.clearSuggestions();
      process.stdout.write('\r\n');
      this.render();
    } else {
      const now = Date.now();
      if (now - this.lastCtrlCTime < 1500) {
        this.clearSuggestions();
        process.stdout.write('\r\n');
        this.opts.onExit();
        return;
      }
      this.lastCtrlCTime = now;
      this.clearSuggestions();
      process.stdout.write(`\r\n${C.dim}  Press Ctrl+C again to exit${C.reset}\r\n`);
      this.render();
    }
  }

  private deleteWordBack() {
    const before = this.buffer.slice(0, this.cursor);
    const match = before.match(/\S+\s*$/);
    if (match) {
      const len = match[0].length;
      this.buffer =
        this.buffer.slice(0, this.cursor - len) +
        this.buffer.slice(this.cursor);
      this.cursor -= len;
    }
  }

  private submitLine() {
    const line = this.buffer;

    this.clearSuggestions();
    process.stdout.write('\r\n');

    if (line.trim()) {
      this.history.unshift(line);
      if (this.history.length > 200) this.history.pop();
    }

    this.buffer = '';
    this.cursor = 0;
    this.historyIndex = -1;
    this.suggestions = [];
    this.selectedIndex = -1;

    this.opts.onSubmit(line);
  }

  private acceptSuggestion() {
    const s = this.suggestions[this.selectedIndex];
    if (!s) return;

    if (this.buffer.startsWith('/')) {
      this.buffer = s.text;
      this.cursor = this.buffer.length;
    } else {
      const atMatch = this.buffer.match(/@[\w./:~\-]*$/);
      if (atMatch && atMatch.index !== undefined) {
        this.buffer = this.buffer.slice(0, atMatch.index) + s.text;
        this.cursor = this.buffer.length;
      }
    }

    this.selectedIndex = -1;

    if (s.text.endsWith('/')) {
      this.computeSuggestions();
    }
  }

  private computeSuggestions() {
    this.selectedIndex = -1;

    if (this.buffer.startsWith('/')) {
      this.suggestions = this.opts.getCommandSuggestions(this.buffer);
      return;
    }

    const atMatch = this.buffer.match(/@([\w./:~\-]*)$/);
    if (atMatch) {
      this.suggestions = this.opts.getMentionSuggestions(atMatch[1]);
      return;
    }

    this.suggestions = [];
  }

  private render() {
    const write = (s: string) => process.stdout.write(s);

    write(`\r\x1b[K`);

    write(this.prompt + this.buffer);

    write('\x1b[J');

    this.renderedLines = 0;

    if (this.suggestions.length > 0) {
      const maxVisible = 10;
      const total = this.suggestions.length;

      let scrollStart = 0;
      if (this.selectedIndex >= 0 && total > maxVisible) {
        scrollStart = Math.max(0, Math.min(
          this.selectedIndex - Math.floor(maxVisible / 2),
          total - maxVisible,
        ));
      }
      const scrollEnd = Math.min(scrollStart + maxVisible, total);

      if (scrollStart > 0) {
        write(`\r\n    ${C.dim}\u2191 ${scrollStart} above${C.reset}`);
        this.renderedLines++;
      }

      for (let i = scrollStart; i < scrollEnd; i++) {
        const s = this.suggestions[i];
        const selected = i === this.selectedIndex;

        if (selected) {
          write(`\r\n  ${C.cyan}\u276f${C.reset} ${C.bold}${C.cyan}${s.display}${C.reset}`);
        } else {
          write(`\r\n    ${C.dim}${s.display}${C.reset}`);
        }

        if (s.description) {
          write(`  ${C.gray}${s.description}${C.reset}`);
        }

        this.renderedLines++;
      }

      const remaining = total - scrollEnd;
      if (remaining > 0) {
        write(`\r\n    ${C.dim}\u2193 ${remaining} below${C.reset}`);
        this.renderedLines++;
      }
    }

    if (this.renderedLines > 0) {
      write(`\x1b[${this.renderedLines}A`);
    }

    const col = this.promptLen + this.cursor + 1;
    write(`\x1b[${col}G`);
  }

  private clearSuggestions() {
    if (this.renderedLines > 0) {
      const endCol = this.promptLen + this.buffer.length + 1;
      process.stdout.write(`\x1b[${endCol}G\x1b[J`);
      this.renderedLines = 0;
    }
  }
}
