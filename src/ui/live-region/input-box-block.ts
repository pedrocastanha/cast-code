import { Box, Colors } from '../../modules/repl/utils/theme';
import { visibleWidth } from '../cast-design/cli-renderer';
import type { LiveBlock } from './compositor';
import { MultilineBuffer } from './multiline-buffer';

const MIN_BOX_WIDTH = 40;
const LABEL = '› ';

export interface InputBoxOptions {
  placeholder?: string;
}

interface VisualRow {
  text: string;
  logicalRow: number;
  chunkStart: number;
}

export class InputBoxBlock implements LiveBlock {
  readonly id = 'input-box';
  readonly buffer = new MultilineBuffer();

  constructor(private readonly opts: InputBoxOptions) {}

  /** Inner width available for text on each box row. */
  private textWidth(width: number): number {
    return Math.max(1, width - 4 - LABEL.length);
  }

  /** Buffer lines wrapped at textWidth, tagged with their origin. */
  private visualRows(width: number): VisualRow[] {
    const tw = this.textWidth(width);
    const rows: VisualRow[] = [];
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
      // Cursor can sit just past a line whose length is an exact multiple
      // of the wrap width; give it a landing row.
      if (line.length % tw === 0) {
        rows.push({ text: '', logicalRow: i, chunkStart: line.length });
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
    const lines: string[] = [top];

    if (this.buffer.isEmpty) {
      const placeholder = this.opts.placeholder
        ? `${Colors.dim}${this.opts.placeholder}${Colors.reset}`
        : '';
      lines.push(this.boxRow(`${Colors.primary}${LABEL}${Colors.reset}${placeholder}`, inner));
    } else {
      const rows = this.visualRows(width);
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
    if (this.buffer.isEmpty && this.opts.placeholder) {
      return [`${Colors.primary}${LABEL}${Colors.reset}${Colors.dim}${this.opts.placeholder}${Colors.reset}`];
    }
    const lines = this.buffer.getLines();
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

    const rows = this.visualRows(width);
    const tw = this.textWidth(width);
    let visualRow = 0;
    let visualCol = 0;

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].logicalRow !== row) continue;
      const within = col - rows[i].chunkStart;
      if (within >= 0 && within < tw) {
        visualRow = i;
        visualCol = within;
        break;
      }
      // Exact end of a full chunk: prefer the next row for this logical
      // line when it exists (cursor at wrap boundary), else clamp here.
      if (within === tw) {
        const next = rows[i + 1];
        if (next && next.logicalRow === row) {
          visualRow = i + 1;
          visualCol = 0;
        } else {
          visualRow = i;
          visualCol = within;
        }
        break;
      }
    }

    // +1 for the top border row; +2 for '│ '; + label width on every row
    return { row: 1 + visualRow, col: 2 + LABEL.length + visualCol };
  }
}
