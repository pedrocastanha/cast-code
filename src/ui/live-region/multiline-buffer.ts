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
