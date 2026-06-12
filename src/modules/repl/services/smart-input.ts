import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Colors } from '../utils/theme';
import { visibleWidth } from '../../../ui/cast-design/cli-renderer';
import { KeyDecoder } from '../../../ui/live-region/key-decoder';
import { InputBoxBlock } from '../../../ui/live-region/input-box-block';
import { FooterBlock } from '../../../ui/live-region/footer-block';
import type { LiveRegionCompositor } from '../../../ui/live-region/compositor';

const HISTORY_FILE = path.join(os.homedir(), '.cast', 'history');
const MAX_HISTORY = 500;

function loadHistory(): string[] {
  try {
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .reverse()
      .slice(0, MAX_HISTORY)
      .map((l) => l.replace(/\\n/g, '\n'));
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
  setFooterStatus(status: { mode: string; model: string; hints: string[] }): void;
}

export interface SmartInputOptions {
  getCommandSuggestions: (input: string) => Suggestion[];
  getMentionSuggestions: (partial: string) => Suggestion[];
  getReferenceSuggestions?: (partial: string) => Suggestion[];
  getFooterLines?: () => string[];
  placeholder?: string;
  compositor: LiveRegionCompositor;
  onSubmit: (line: string) => void;
  onCancel: () => void;
  onExit: () => void;
  onCycleMode?: () => void;
  onExpandToolOutput?: () => void;
}

export class SmartInput implements ISmartInput {
  private readonly decoder = new KeyDecoder();
  private readonly inputBox: InputBoxBlock;
  private readonly footer = new FooterBlock();
  private readonly compositor: LiveRegionCompositor;

  private history: string[] = [];
  private historyIndex = -1;
  private savedBuffer = '';

  private suggestions: Suggestion[] = [];
  private selectedIndex = -1;

  private mode: 'input' | 'passive' | 'question' | 'choice' = 'input';
  private questionResolve: ((answer: string) => void) | null = null;
  private questionBuffer = '';
  private choiceMessage = '';
  private choiceOptions: ChoiceOption[] = [];
  private choiceSelectedIndex = 0;
  private choiceResolve: ((answer: string) => void) | null = null;
  private choiceRenderedLines = 0;

  private opts: SmartInputOptions;

  private dataHandler: ((data: string) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private isPaused = false;
  private externalOutputActive = false;
  private hasExplicitStatus = false;

  constructor(opts: SmartInputOptions) {
    this.opts = opts;
    this.inputBox = new InputBoxBlock({ placeholder: opts.placeholder });
    this.compositor = opts.compositor;
    this.compositor.addBlock(this.inputBox);
    this.compositor.addBlock(this.footer);
    this.history = loadHistory();
  }

  start() {
    this.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdout.write('\x1b[?2004h');

    this.resizeHandler = () => this.refreshLiveRegion();
    process.stdout.on('resize', this.resizeHandler);

    this.dataHandler = (data: string) => this.handleData(data);
    process.stdin.on('data', this.dataHandler);

    this.mode = 'input';
    this.refreshLiveRegion();
  }

  enterPassiveMode() {
    this.mode = 'passive';
  }

  exitPassiveMode() {
    this.mode = 'input';
  }

  showPrompt() {
    this.inputBox.buffer.clear();
    this.suggestions = [];
    this.selectedIndex = -1;
    this.historyIndex = -1;
    this.mode = 'input';
    this.refreshLiveRegion();
  }

  async question(query: string): Promise<string> {
    this.ensurePromptInputActive();
    this.compositor.clear();
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
      this.compositor.clear();
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
    this.compositor.clear();
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
    process.stdout.write('\x1b[?2004l');
    this.externalOutputActive = false;
    if (this.dataHandler) {
      process.stdin.removeListener('data', this.dataHandler);
      this.dataHandler = null;
    }
    if (this.resizeHandler) {
      process.stdout.removeListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.compositor.destroy();
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
    this.refreshLiveRegion();
  }

  setFooterStatus(status: { mode: string; model: string; hints: string[] }): void {
    this.hasExplicitStatus = true;
    this.footer.setStatus(status);
    this.refreshLiveRegion();
  }

  beginExternalOutput() {
    if (this.isPaused || this.mode === 'question' || this.externalOutputActive) {
      return;
    }
    this.compositor.clear();
    this.externalOutputActive = true;
  }

  endExternalOutput() {
    if (!this.externalOutputActive) {
      return;
    }
    this.externalOutputActive = false;
    this.refreshLiveRegion();
  }

  printExternal(text: string) {
    if (this.externalOutputActive || this.isPaused || this.mode === 'question') {
      process.stdout.write(text);
      return;
    }

    this.compositor.scrollOut(text);
  }

  rewriteLinesAbove(lineCount: number, content: string) {
    if (lineCount <= 0) {
      this.printExternal(content);
      return;
    }

    if (this.externalOutputActive || this.isPaused || this.mode === 'question') {
      const write = (text: string) => process.stdout.write(text);
      write(`\x1b[${lineCount}A\r`);
      write('\x1b[0J');
      write(content);
      if (content.length > 0 && !content.endsWith('\n') && !content.endsWith('\r\n')) {
        write('\r\n');
      }
      return;
    }

    this.compositor.clear();
    const write = (text: string) => process.stdout.write(text);
    write(`\x1b[${lineCount}A\r`);
    write('\x1b[0J');
    write(content);
    if (content.length > 0 && !content.endsWith('\n') && !content.endsWith('\r\n')) {
      write('\r\n');
    }
    this.refreshLiveRegion();
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
    const events = this.decoder.feed(data);
    let bufferChanged = false;
    let changed = false;
    const buffer = this.inputBox.buffer;

    for (const event of events) {
      switch (event.type) {
      case 'char':
        buffer.insert(event.char);
        bufferChanged = true;
        changed = true;
        break;

      case 'paste':
        buffer.insert(event.text);
        bufferChanged = true;
        changed = true;
        break;

      case 'newline':
        buffer.newline();
        bufferChanged = true;
        changed = true;
        break;

      case 'enter':
        this.keyEnter();
        return;

      case 'up':
        this.keyUp();
        changed = true;
        break;

      case 'down':
        this.keyDown();
        changed = true;
        break;

      case 'left':
        buffer.moveLeft();
        changed = true;
        break;

      case 'right':
        buffer.moveRight();
        changed = true;
        break;

      case 'home':
        buffer.moveHome();
        changed = true;
        break;

      case 'end':
        buffer.moveEnd();
        changed = true;
        break;

      case 'backspace':
        buffer.backspace();
        bufferChanged = true;
        changed = true;
        break;

      case 'delete':
        buffer.deleteForward();
        bufferChanged = true;
        changed = true;
        break;

      case 'tab':
        this.keyTab();
        bufferChanged = true;
        changed = true;
        break;

      case 'shift-tab':
        this.keyShiftTab();
        changed = true;
        break;

      case 'ctrl':
        if (this.handleCtrl(event.key)) {
          return;
        }
        bufferChanged = true;
        changed = true;
        break;
      }
    }

    if (bufferChanged) {
      this.computeSuggestions();
    }
    if (changed) {
      this.refreshLiveRegion();
    }
  }

  /** Returns true when the key triggered an exit/early return. */
  private handleCtrl(key: string): boolean {
    const buffer = this.inputBox.buffer;
    switch (key) {
    case 'a':
      buffer.moveHome();
      return false;
    case 'e':
      buffer.moveEnd();
      return false;
    case 'u':
      buffer.killToStart();
      return false;
    case 'k':
      buffer.killToEnd();
      return false;
    case 'w':
      buffer.deleteWordBack();
      return false;
    case 'l':
      process.stdout.write('\x1b[2J\x1b[H');
      this.refreshLiveRegion();
      return true;
    case 'c':
      this.keyCtrlC();
      return true;
    case 'd':
      if (buffer.isEmpty) {
        this.suggestions = [];
        this.selectedIndex = -1;
        this.footer.setSuggestions([], -1);
        this.compositor.clear();
        process.stdout.write('\r\n');
        this.opts.onExit();
        return true;
      }
      return false;
    case 'o':
      if (this.opts.onExpandToolOutput) {
        this.compositor.clear();
        process.stdout.write('\r\n');
        this.opts.onExpandToolOutput();
        this.refreshLiveRegion();
      }
      return true;
    default:
      return false;
    }
  }

  private keyUp() {
    const buffer = this.inputBox.buffer;
    if (this.suggestions.length > 0) {
      this.selectedIndex =
        this.selectedIndex <= 0
          ? this.suggestions.length - 1
          : this.selectedIndex - 1;
      return;
    }

    if (buffer.moveUp()) {
      return;
    }

    if (this.historyIndex === -1) this.savedBuffer = buffer.text;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      buffer.setText(this.history[this.historyIndex]);
    }
  }

  private keyDown() {
    const buffer = this.inputBox.buffer;
    if (this.suggestions.length > 0) {
      this.selectedIndex =
        this.selectedIndex >= this.suggestions.length - 1
          ? 0
          : this.selectedIndex + 1;
      return;
    }

    if (buffer.moveDown()) {
      return;
    }

    if (this.historyIndex > 0) {
      this.historyIndex--;
      buffer.setText(this.history[this.historyIndex]);
    } else if (this.historyIndex === 0) {
      this.historyIndex = -1;
      buffer.setText(this.savedBuffer);
    }
  }

  private keyEnter() {
    if (this.selectedIndex >= 0 && this.suggestions.length > 0) {
      this.acceptSuggestion();
      this.computeSuggestions();
      this.refreshLiveRegion();
      return;
    }

    const buffer = this.inputBox.buffer;
    const lines = buffer.getLines();
    const { row, col } = buffer.cursor;
    const currentLine = lines[row];
    if (currentLine.endsWith('\\') && col === currentLine.length) {
      buffer.backspace();
      buffer.newline();
      this.refreshLiveRegion();
      return;
    }

    this.submitLine();
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
    this.suggestions = [];
    this.selectedIndex = -1;
    this.footer.setSuggestions([], -1);
    this.opts.onCycleMode?.();
  }

  private lastCtrlCTime = 0;

  private keyCtrlC() {
    const buffer = this.inputBox.buffer;
    if (!buffer.isEmpty) {
      buffer.clear();
      this.suggestions = [];
      this.selectedIndex = -1;
      this.lastCtrlCTime = Date.now();
      this.footer.setSuggestions([], -1);
      this.compositor.scrollOut('\r\n');
      this.refreshLiveRegion();
    } else {
      const now = Date.now();
      if (now - this.lastCtrlCTime < 1500) {
        this.suggestions = [];
        this.selectedIndex = -1;
        this.footer.setSuggestions([], -1);
        this.compositor.clear();
        process.stdout.write('\r\n');
        this.opts.onExit();
        return;
      }
      this.lastCtrlCTime = now;
      this.suggestions = [];
      this.selectedIndex = -1;
      this.footer.setSuggestions([], -1);
      this.compositor.scrollOut(`\r\n${Colors.dim}  Press Ctrl+C again to exit${Colors.reset}\r\n`);
      this.refreshLiveRegion();
    }
  }

  private acceptSuggestion() {
    const s = this.suggestions[this.selectedIndex];
    if (!s) return;

    const buffer = this.inputBox.buffer;
    const text = buffer.text;

    if (text.startsWith('/')) {
      buffer.setText(s.text);
    } else {
      const atMatch = text.match(/@\[?[\w./:~-]*\]?$/);
      if (atMatch && atMatch.index !== undefined) {
        buffer.setText(text.slice(0, atMatch.index) + s.text);
      } else {
        const referenceMatch = text.match(/\$[\w.-]*$/);
        if (referenceMatch && referenceMatch.index !== undefined) {
          buffer.setText(text.slice(0, referenceMatch.index) + s.text);
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
    const text = this.inputBox.buffer.text;

    if (text.startsWith('/')) {
      this.suggestions = this.opts.getCommandSuggestions(text);
      return;
    }

    const atMatch = text.match(/@\[?([\w./:~-]*)\]?$/);
    if (atMatch) {
      this.suggestions = this.opts.getMentionSuggestions(atMatch[1]);
      return;
    }

    const referenceMatch = text.match(/\$([\w.-]*)$/);
    if (referenceMatch && this.opts.getReferenceSuggestions) {
      this.suggestions = this.opts.getReferenceSuggestions(referenceMatch[1]);
      return;
    }

    this.suggestions = [];
  }

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

  private refreshLiveRegion() {
    this.footer.setSuggestions(this.suggestions, this.selectedIndex);
    if (this.suggestions.length === 0 && !this.hasExplicitStatus && this.opts.getFooterLines) {
      const legacy = this.opts.getFooterLines();
      this.footer.setStatus({ mode: '', model: '', hints: legacy.length > 0 ? [legacy[0]] : [] });
    }
    const width = Math.max(1, process.stdout.columns || 80);
    const pos = this.inputBox.cursorPosition(width);
    this.compositor.setCursor(this.inputBox.id, pos.row, pos.col);
    this.compositor.repaint();
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
        const isSelected = index === this.choiceSelectedIndex;
        const marker = isSelected ? `${Colors.primary}❯${Colors.reset}` : ' ';
        const label = isSelected
          ? `${Colors.bold}${Colors.primary}${choice.label}${Colors.reset}`
          : `${Colors.white}${choice.label}${Colors.reset}`;
        const desc = choice.description ? `  ${Colors.muted}${choice.description}${Colors.reset}` : '';
        return `  ${marker} ${label}${desc}`;
      }),
      '',
      `${Colors.dim}  ↑/↓ move · Enter select${tabHint} · number shortcuts · Ctrl+C cancel${Colors.reset}`,
    ];

    const width = Math.max(1, process.stdout.columns || 80);
    let totalRows = 0;
    for (const line of lines) {
      process.stdout.write(`${line}\r\n`);
      totalRows += Math.max(1, Math.ceil(Math.max(1, visibleWidth(line)) / width));
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

  writeOutputLine(line: string): void {
    if (this.externalOutputActive || this.isPaused || this.mode === 'question') {
      process.stdout.write(line + '\r\n');
      return;
    }
    this.compositor.scrollOut(line + '\r\n');
  }
}
