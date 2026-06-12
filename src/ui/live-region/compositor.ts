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
