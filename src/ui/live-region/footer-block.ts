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
