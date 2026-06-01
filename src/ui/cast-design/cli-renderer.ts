import { Box } from '../../modules/repl/utils/theme';

export type Align = 'left' | 'center' | 'right';

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

export function visibleWidth(value: string): number {
  return stripAnsi(value).length;
}

export function padVisible(value: string, width: number, align: Align = 'left'): string {
  const current = visibleWidth(value);
  if (current >= width) return value;

  const diff = width - current;
  if (align === 'right') return ' '.repeat(diff) + value;
  if (align === 'center') {
    const left = Math.floor(diff / 2);
    return ' '.repeat(left) + value + ' '.repeat(diff - left);
  }
  return value + ' '.repeat(diff);
}

export function truncateVisible(value: string, width: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  return plain.slice(0, Math.max(0, width - 1)) + '…';
}

export function wrapRow(content: string, innerWidth: number, borderColor: string): string {
  const visible = truncateVisible(content, innerWidth);
  return `${borderColor}${Box.vertical}\x1b[0m ${padVisible(visible, innerWidth)} ${borderColor}${Box.vertical}\x1b[0m`;
}

export function horizontalRule(innerWidth: number, left: string, right: string, color: string): string {
  return `${color}${left}${Box.horizontal.repeat(innerWidth + 2)}${right}\x1b[0m`;
}

export function titleRule(
  innerWidth: number,
  title: string,
  color: string,
  fillColor: string,
): string {
  const label = ` ${title} `;
  const fill = Math.max(0, innerWidth + 2 - label.length);
  return `${color}${Box.topLeft}\x1b[0m${fillColor}${Box.horizontal.repeat(fill)}\x1b[0m${color}${label}${Box.topRight}\x1b[0m`;
}
