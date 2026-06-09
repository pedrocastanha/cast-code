import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Colors } from '../utils/theme';
import { truncateVisible, visibleWidth } from '../../../ui/cast-design/cli-renderer';

const HISTORY_FILE = path.join(os.homedir(), '.cast', 'history');
const MAX_HISTORY = 500;

function loadHistory(): string[] {
  try {
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return content.split('\n').filter(Boolean).reverse().slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function appendHistory(line: string): void {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.appendFileSync(HISTORY_FILE, line + '\n', 'utf-8');
  } catch { /* best-effort */ }
}

export interface Suggestion {
  text: string;
  display: string;
  description?: string;
}

export interface ChoiceOption {
  key: string;
  label: string;
  description?: string;
  tabKey?: string;
  tabLabel?: string;
}

export interface ISmartInput {
  pause(): void;
  resume(): void;
  question(query: string): Promise<string>;
  askChoice(message: string, choices: ChoiceOption[]): Promise<string>;
  start(): void;
  destroy(): void;
  refresh(): void;
  beginExternalOutput?(): void;
  endExternalOutput?(): void;
  printExternal(text: string): void;
  rewriteLinesAbove(lineCount: number, content: string): void;
  writeOutputLine(line: string): void;
  showPrompt(): void;
  enterPassiveMode(): void;
  exitPassiveMode(): void;
}

export interface SmartInputOptions {
  prompt: string;
  promptVisibleLen: number;
  getCommandSuggestions: (input: string) => Suggestion[];
  getMentionSuggestions: (partial: string) => Suggestion[];
  getReferenceSuggestions?: (partial: string) => Suggestion[];
  getFooterLines?: () => string[];
  placeholder?: string;
  onSubmit: (line: string) => void;
  onCancel: () => void;
  onExit: () => void;
  onCycleMode?: () => void;
  onExpandToolOutput?: () => void;
}

export class SmartInput implements ISmartInput {
  private buffer = '';
  private cursor = 0;

  private history: string[] = [];
  private historyIndex = -1;
  private savedBuffer = '';

  private suggestions: Suggestion[] = [];
  private selectedIndex = -1;
  private renderedLines = 0;
  private renderedInputRows = 0;

  private mode: 'input' | 'passive' | 'question' | 'choice' = 'input';
  private questionResolve: ((answer: string) => void) | null = null;
  private questionBuffer = '';
  private choiceMessage = '';
  private choiceOptions: ChoiceOption[] = [];
  private choiceSelectedIndex = 0;
  private choiceResolve: ((answer: string) => void) | null = null;
  private choiceRenderedLines = 0;

  private prompt: string;
  private promptLen: number;
  private opts: SmartInputOptions;

  private dataHandler: ((data: string) => void) | null = null;
  private terminalWidth = 80;
  private isPaused = false;
  private externalOutputActive = false;
  private cursorRow = 0;

  constructor(opts: SmartInputOptions) {
    this.opts = opts;
    this.prompt = opts.prompt;
    this.promptLen = opts.promptVisibleLen;
    this.history = loadHistory();
  }

  start() {
    this.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    this.terminalWidth = process.stdout.columns || 80;

    process.stdout.on('resize', () => {
      this.terminalWidth = process.stdout.columns || 80;
    });

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
    this.cursorRow = 0;
    this.mode = 'input';
    this.render();
  }

  async question(query: string): Promise<string> {
    this.ensurePromptInputActive();
    this.mode = 'question';
    this.questionBuffer = '';
    process.stdout.write(query + ' ');

    return new Promise<string>((resolve) => {
      this.questionResolve = resolve;
    });
  }

  async askChoice(
    message: string,
    choices: ChoiceOption[],
  ): Promise<string> {
    if (choices.length === 0) {
      throw new Error('askChoice requires at least one choice');
    }

    if (this.shouldUseInteractiveChoice()) {
      this.ensurePromptInputActive();
      this.clearRenderedBlock();
      this.mode = 'choice';
      this.choiceMessage = message;
      this.choiceOptions = choices;
      this.choiceSelectedIndex = 0;
      this.renderChoiceMenu();

      return new Promise<string>((resolve) => {
        this.choiceResolve = resolve;
      });
    }

    return this.askChoiceByNumber(message, choices);
  }

  private async askChoiceByNumber(message: string, choices: ChoiceOption[]): Promise<string> {
    process.stdout.write(`\r\n${Colors.cyan}${message}${Colors.reset}\r\n\r\n`);
    choices.forEach((ch, i) => {
      const desc = ch.description ? `${Colors.dim} - ${ch.description}${Colors.reset}` : '';
      process.stdout.write(`  ${Colors.white}${i + 1}.${Colors.reset} ${Colors.bold}${ch.label}${Colors.reset}${desc}\r\n`);
    });
    process.stdout.write('\r\n');

    while (true) {
      const answer = await this.question(`${Colors.yellow}Choose (1-${choices.length}):${Colors.reset}`);
      const trimmed = answer.trim();
      if (trimmed === '/exit' || trimmed === '/quit' || trimmed === 'q') {
        process.stdout.write(`${Colors.dim}  Goodbye${Colors.reset}\r\n\r\n`);
        process.exit(0);
      }
      const idx = parseInt(trimmed) - 1;
      if (idx >= 0 && idx < choices.length) {
        return choices[idx].key;
      }
      process.stdout.write(`${Colors.red}  Invalid choice, try again.${Colors.reset}\r\n`);
    }
  }

  private shouldUseInteractiveChoice(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.env.CI !== 'true');
  }

  pause() {
    this.isPaused = true;
    if (this.dataHandler) {
      process.stdin.removeListener('data', this.dataHandler);
    }
    this.setRawMode(false);
    this.clearRenderedBlock();
    this.clearSuggestions();
    process.stdout.write('\r\n');
  }

  resume() {
    this.ensurePromptInputActive();
    this.showPrompt();
  }

  private ensurePromptInputActive() {
    this.isPaused = false;
    if (this.dataHandler) {
      const dataListeners = process.stdin.listeners('data');
      if (!dataListeners.includes(this.dataHandler)) {
        process.stdin.on('data', this.dataHandler);
      }
    }
    this.setRawMode(true);
    process.stdin.resume();
  }

  destroy() {
    this.clearSuggestions();
    this.externalOutputActive = false;
    if (this.dataHandler) {
      process.stdin.removeListener('data', this.dataHandler);
      this.dataHandler = null;
    }
    this.setRawMode(false);
  }

  private setRawMode(enabled: boolean) {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(enabled);
    }
  }

  refresh() {
    if (this.isPaused || this.mode === 'question' || this.mode === 'choice' || this.externalOutputActive) {
      return;
    }
    this.render();
  }

  beginExternalOutput() {
    if (this.isPaused || this.mode === 'question' || this.externalOutputActive) {
      return;
    }
    this.clearRenderedBlock();
    this.externalOutputActive = true;
  }

  endExternalOutput() {
    if (!this.externalOutputActive) {
      return;
    }
    this.externalOutputActive = false;
    this.render();
  }

  printExternal(text: string) {
    if (this.externalOutputActive) {
      process.stdout.write(text);
      return;
    }

    if (this.isPaused || this.mode === 'question') {
      process.stdout.write(text);
      return;
    }

    this.clearRenderedBlock();
    process.stdout.write(text);
    if (text.length > 0 && !text.endsWith('\n')) {
      process.stdout.write('\r\n');
    }
    this.render();
  }

  rewriteLinesAbove(lineCount: number, content: string) {
    if (lineCount <= 0) {
      this.printExternal(content);
      return;
    }

    const write = (text: string) => process.stdout.write(text);
    write(`\x1b[${lineCount}A\r`);
    write('\x1b[0J');
    write(content);
    if (content.length > 0 && !content.endsWith('\n') && !content.endsWith('\r\n')) {
      write('\r\n');
    }

    if (this.externalOutputActive || this.isPaused || this.mode === 'question') {
      return;
    }

    this.clearRenderedBlock();
    this.render();
  }

  private handleData(data: string) {
    if (this.isPaused) {
      return;
    }

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

    if (this.mode === 'choice') {
      this.handleChoiceData(data);
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

  private handleChoiceData(data: string) {
    let i = 0;
    while (i < data.length) {
      if (data[i] === '\x1b' && data[i + 1] === '[') {
        const rest = data.slice(i);
        if (rest.startsWith('\x1b[A')) {
          this.choiceSelectedIndex = this.choiceSelectedIndex <= 0
            ? this.choiceOptions.length - 1
            : this.choiceSelectedIndex - 1;
          this.renderChoiceMenu();
          i += 3;
          continue;
        }
        if (rest.startsWith('\x1b[B')) {
          this.choiceSelectedIndex = this.choiceSelectedIndex >= this.choiceOptions.length - 1
            ? 0
            : this.choiceSelectedIndex + 1;
          this.renderChoiceMenu();
          i += 3;
          continue;
        }
      }

      const code = data.charCodeAt(i);
      if (code === 0x09) {
        const selected = this.choiceOptions[this.choiceSelectedIndex];
        if (selected?.tabKey) {
          this.resolveChoice(selected.tabKey);
          return;
        }
      }

      if (code === 0x0d || code === 0x0a) {
        this.resolveChoice(this.choiceOptions[this.choiceSelectedIndex]?.key || this.choiceOptions[0].key);
        return;
      }

      if (code === 0x03) {
        this.resolveChoice('');
        return;
      }

      if (data[i] === 'q') {
        this.resolveChoice('');
        return;
      }

      const numeric = Number.parseInt(data[i], 10);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= this.choiceOptions.length) {
        this.resolveChoice(this.choiceOptions[numeric - 1].key);
        return;
      }

      if (code >= 0x20) {
        const shortcut = data[i].toLowerCase();
        const exactKey = this.choiceOptions.find((choice) =>
          choice.key.length === 1 && choice.key.toLowerCase() === shortcut,
        );
        if (exactKey) {
          this.resolveChoice(exactKey.key);
          return;
        }

        const labelMatch = this.choiceOptions.find((choice) =>
          choice.label.trim().toLowerCase().startsWith(shortcut),
        );
        if (labelMatch) {
          this.resolveChoice(labelMatch.key);
          return;
        }
      }

      i++;
    }
  }

  private resolveChoice(answer: string) {
    const selected = this.choiceOptions.find((choice) => choice.key === answer || choice.tabKey === answer);
    this.clearChoiceMenu();
    if (selected) {
      const tabAction = selected.tabKey === answer && selected.tabLabel
        ? `${selected.label} · ${selected.tabLabel}`
        : selected.label;
      process.stdout.write(`\r\n  ${Colors.green}✓${Colors.reset} ${Colors.dim}${tabAction}${Colors.reset}\r\n`);
    } else {
      process.stdout.write('\r\n');
    }

    const resolve = this.choiceResolve;
    this.choiceResolve = null;
    this.choiceMessage = '';
    this.choiceOptions = [];
    this.choiceSelectedIndex = 0;
    this.mode = 'input';
    if (resolve) resolve(answer);
  }

  private handleInputData(data: string) {
    let needsRender = false;
    let bufferChanged = false;
    let i = 0;

    while (i < data.length) {
      if (data[i] === '\x1b' && data[i + 1] === '[') {
        const rest = data.slice(i);

        if (rest.startsWith('\x1b[A')) { this.keyUp(); i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[B')) { this.keyDown(); i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[C')) { this.keyRight(); i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[D')) { this.keyLeft(); i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[Z')) { this.keyShiftTab(); i += 3; continue; }
        if (rest.startsWith('\x1b[H')) { this.cursor = 0; i += 3; needsRender = true; continue; }
        if (rest.startsWith('\x1b[F')) { this.cursor = this.buffer.length; i += 3; needsRender = true; continue; }
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

  private keyLeft() { if (this.cursor > 0) this.cursor--; }
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

  private keyShiftTab() {
    this.clearSuggestions();
    this.opts.onCycleMode?.();
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
      process.stdout.write(`\r\n${Colors.dim}  Press Ctrl+C again to exit${Colors.reset}\r\n`);
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

    const termWidth = this.getTerminalWidth();
    const inputRows = this.renderedInputRows;
    const curRow = this.cursorRow;

    if (curRow < inputRows - 1) {
      process.stdout.write(`\x1b[${inputRows - 1 - curRow}B`);
    }
    if (inputRows > 1) {
      process.stdout.write(`\x1b[${inputRows - 1}A`);
    }
    process.stdout.write('\r');

    for (let i = 0; i < inputRows; i++) {
      process.stdout.write('\x1b[2K');
      if (i < inputRows - 1) process.stdout.write('\n');
    }
    if (inputRows > 1) {
      process.stdout.write(`\x1b[${inputRows - 1}A`);
    }
    process.stdout.write('\r');

    if (line.trim()) {
      const display = ` ${line}`;
      const padLen = Math.max(0, termWidth - display.length);
      process.stdout.write(`\x1b[48;5;235m\x1b[38;5;250m${display}${' '.repeat(padLen)}\x1b[0m\r\n`);
    } else {
      process.stdout.write('\r\n');
    }

    this.renderedInputRows = 0;
    this.renderedLines = 0;
    this.cursorRow = 0;

    if (line.trim()) {
      this.history.unshift(line);
      if (this.history.length > MAX_HISTORY) this.history.pop();
      appendHistory(line);
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
      const atMatch = this.buffer.match(/@\[?[\w./:~-]*\]?$/);
      if (atMatch && atMatch.index !== undefined) {
        this.buffer = this.buffer.slice(0, atMatch.index) + s.text;
        this.cursor = this.buffer.length;
      } else {
        const referenceMatch = this.buffer.match(/\$[\w.-]*$/);
        if (referenceMatch && referenceMatch.index !== undefined) {
          this.buffer = this.buffer.slice(0, referenceMatch.index) + s.text;
          this.cursor = this.buffer.length;
        }
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

    const atMatch = this.buffer.match(/@\[?([\w./:~-]*)\]?$/);
    if (atMatch) {
      this.suggestions = this.opts.getMentionSuggestions(atMatch[1]);
      return;
    }

    const referenceMatch = this.buffer.match(/\$([\w.-]*)$/);
    if (referenceMatch && this.opts.getReferenceSuggestions) {
      this.suggestions = this.opts.getReferenceSuggestions(referenceMatch[1]);
      return;
    }

    this.suggestions = [];
  }

  private calculateCursorPosition(): { row: number; col: number } {
    const width = this.getTerminalWidth();
    const totalLength = this.promptLen + this.cursor;
    const row = Math.floor(totalLength / width) + 1;
    const col = (totalLength % width) + 1;
    return { row, col };
  }

  private getTerminalWidth(): number {
    return Math.max(1, this.terminalWidth || process.stdout.columns || 80);
  }

  private countWrappedRows(value: string): number {
    const width = this.getTerminalWidth();
    const length = visibleWidth(value);
    return Math.max(1, Math.ceil(Math.max(1, length) / width));
  }

  private countInputRows(totalLength: number): number {
    const width = this.getTerminalWidth();
    const linesUsed = Math.max(1, Math.ceil(Math.max(1, totalLength) / width));
    const exactWrap = totalLength > 0 && totalLength % width === 0;
    return linesUsed + (exactWrap ? 1 : 0) + 2;
  }

  private getFooterLines(): string[] {
    return this.opts.getFooterLines ? this.opts.getFooterLines() : [];
  }

  private clearRenderedBlock() {
    const write = (s: string) => process.stdout.write(s);

    const linesToClear = this.renderedInputRows + this.renderedLines;
    if (linesToClear <= 0) {
      this.cursorRow = 0;
      return;
    }

    if (this.cursorRow > 0) {
      write(`\x1b[${this.cursorRow}A`);
    }
    write('\r');

    for (let i = 0; i < linesToClear; i++) {
      write('\x1b[K');
      if (i < linesToClear - 1) write('\n');
    }

    if (linesToClear > 1) {
      write(`\x1b[${linesToClear - 1}A`);
    }
    write('\r');
    this.cursorRow = 0;
    this.renderedInputRows = 0;
    this.renderedLines = 0;
  }

  writeOutputLine(line: string): void {
    if (this.externalOutputActive || this.isPaused || this.mode === 'question') {
      process.stdout.write(line + '\r\n');
      return;
    }
    this.clearRenderedBlock();
    process.stdout.write(line + '\r\n');
    this.render();
  }

  private render() {
    const write = (s: string) => process.stdout.write(s);
    const inputLines = this.buildInputLines();
    const promptRows = inputLines.length;
    const footerLines = this.suggestions.length > 0 ? [] : this.getFooterLines();
    const inputRows = promptRows;
    this.clearRenderedBlock();

    for (let i = 0; i < inputLines.length; i++) {
      write(inputLines[i]);
      if (i < inputLines.length - 1) {
        write('\r\n');
      }
    }

    write('\x1b[J');

    let extraLines = 0;

    for (const line of footerLines) {
      write(`\r\n${line}`);
      extraLines += this.countWrappedRows(line);
    }

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
        const line = `    ${Colors.dim}\u2191 ${scrollStart} above${Colors.reset}`;
        write(`\r\n${line}`);
        extraLines += this.countWrappedRows(line);
      }

      for (let i = scrollStart; i < scrollEnd; i++) {
        const s = this.suggestions[i];
        const line = this.formatSuggestionLine(s, i === this.selectedIndex);

        write(`\r\n${line}`);
        extraLines += this.countWrappedRows(line);
      }

      const remaining = total - scrollEnd;
      if (remaining > 0) {
        const line = `    ${Colors.dim}\u2193 ${remaining} below${Colors.reset}`;
        write(`\r\n${line}`);
        extraLines += this.countWrappedRows(line);
      }
    }

    this.renderedLines = extraLines;
    this.renderedInputRows = inputRows;

    if (this.renderedLines > 0) {
      write(`\x1b[${this.renderedLines}A`);
    }

    const { row: targetRow, col: targetCol } = this.calculateCursorPosition();
    const afterWriteRow = inputRows - 1;
    const delta = targetRow - afterWriteRow;

    if (delta > 0) write(`\x1b[${delta}B`);
    else if (delta < 0) write(`\x1b[${-delta}A`);
    write(`\x1b[${targetCol}G`);

    this.cursorRow = targetRow;
  }

  private formatSuggestionLine(s: Suggestion, selected: boolean): string {
    const width = this.getTerminalWidth();
    const marker = selected
      ? `  ${Colors.primary}\u276f${Colors.reset} `
      : '    ';
    const markerWidth = 4;
    const displayBudget = Math.max(1, width - markerWidth);
    const plainDisplay = truncateVisible(s.display, displayBudget);
    const display = selected
      ? `${Colors.bold}${Colors.primary}${plainDisplay}${Colors.reset}`
      : `${Colors.dim}${plainDisplay}${Colors.reset}`;

    let description = '';
    if (s.description && visibleWidth(plainDisplay) < displayBudget) {
      const descriptionBudget = width - markerWidth - visibleWidth(plainDisplay) - 2;
      if (descriptionBudget >= 8) {
        description = `  ${Colors.muted}${truncateVisible(s.description, descriptionBudget)}${Colors.reset}`;
      }
    }

    return `${marker}${display}${description}`;
  }

  private buildInputLines(): string[] {
    const width = this.getTerminalWidth();
    const firstInputWidth = Math.max(0, width - this.promptLen);
    const lines: string[] = [this.formatInputBandLine('')];
    let offset = 0;

    if (firstInputWidth > 0) {
      const firstChunk = this.buffer.slice(0, firstInputWidth);
      const firstLine = firstChunk.length > 0
        ? this.prompt + firstChunk
        : this.formatPlaceholderLine();
      lines.push(this.formatInputBandLine(firstLine));
      offset = firstChunk.length;
    } else {
      lines.push(this.formatInputBandLine(this.prompt));
    }

    while (offset < this.buffer.length) {
      lines.push(this.formatInputBandLine(this.buffer.slice(offset, offset + width)));
      offset += width;
    }

    const totalLength = this.promptLen + this.buffer.length;
    if (totalLength > 0 && totalLength % width === 0) {
      lines.push(this.formatInputBandLine(''));
    }
    lines.push(this.formatInputBandLine(''));

    return lines;
  }

  private formatInputBandLine(content: string): string {
    const width = this.getTerminalWidth();
    const padding = ' '.repeat(Math.max(0, width - visibleWidth(content)));
    const bandStyle = '\x1b[48;2;48;25;40m\x1b[38;5;250m';
    const styledContent = content.replace(/\x1b\[0m/g, `${Colors.reset}${bandStyle}`);
    return `${bandStyle}${styledContent}${padding}${Colors.reset}`;
  }

  private formatPlaceholderLine(): string {
    const placeholder = this.opts.placeholder;
    if (!placeholder) {
      return this.prompt;
    }
    return `${this.prompt} ${Colors.dim}${placeholder}${Colors.reset}`;
  }

  private clearSuggestions() {
    if (this.renderedLines > 0) {
      const width = this.getTerminalWidth();
      const totalLength = this.promptLen + this.buffer.length;
      const afterWriteRow = this.countInputRows(totalLength) - 1;
      const exactWrap = totalLength > 0 && totalLength % width === 0;
      const afterWriteCol = exactWrap ? 1 : (totalLength % width) + 1;

      const delta = afterWriteRow - this.cursorRow;
      if (delta > 0) process.stdout.write(`\x1b[${delta}B`);
      else if (delta < 0) process.stdout.write(`\x1b[${-delta}A`);
      process.stdout.write(`\x1b[${afterWriteCol}G\x1b[J`);

      this.renderedLines = 0;
      this.cursorRow = afterWriteRow;
    }
  }

  private renderChoiceMenu() {
    this.clearChoiceMenu();

    const selected = this.choiceOptions[this.choiceSelectedIndex];
    const tabHint = selected?.tabKey
      ? ` · Tab ${selected.tabLabel || 'alternate action'}`
      : '';
    const lines = [
      `${Colors.cyan}${this.choiceMessage}${Colors.reset}`,
      '',
      ...this.choiceOptions.map((choice, index) => {
        const selected = index === this.choiceSelectedIndex;
        const marker = selected ? `${Colors.primary}❯${Colors.reset}` : ' ';
        const label = selected
          ? `${Colors.bold}${Colors.primary}${choice.label}${Colors.reset}`
          : `${Colors.white}${choice.label}${Colors.reset}`;
        const desc = choice.description ? `  ${Colors.muted}${choice.description}${Colors.reset}` : '';
        return `  ${marker} ${label}${desc}`;
      }),
      '',
      `${Colors.dim}  ↑/↓ move · Enter select${tabHint} · number shortcuts · Ctrl+C cancel${Colors.reset}`,
    ];

    let totalRows = 0;
    for (const line of lines) {
      process.stdout.write(`${line}\r\n`);
      totalRows += this.countWrappedRows(line);
    }
    this.choiceRenderedLines = totalRows;
  }

  private clearChoiceMenu() {
    if (this.choiceRenderedLines <= 0) {
      return;
    }

    const n = this.choiceRenderedLines;
    process.stdout.write(`\x1b[${n}A`);
    for (let i = 0; i < n; i++) {
      process.stdout.write('\x1b[2K');
      if (i < n - 1) {
        process.stdout.write('\n');
      }
    }
    if (n > 1) {
      process.stdout.write(`\x1b[${n - 1}A`);
    }
    process.stdout.write('\r');
    this.choiceRenderedLines = 0;
  }
}
