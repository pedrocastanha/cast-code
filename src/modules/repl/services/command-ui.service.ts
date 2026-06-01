import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../utils/theme';
import { padVisible, stripAnsi, truncateVisible, visibleWidth } from '../../../ui/cast-design/cli-renderer';

type Tone = 'default' | 'success' | 'warning' | 'error' | 'muted';

export type CommandUiRow = {
  label: string;
  value: string;
  hint?: string;
};

export type CommandUiSection = {
  title?: string;
  rows?: CommandUiRow[];
  lines?: string[];
};

export type CommandPanelOptions = {
  title: string;
  subtitle?: string;
  sections?: CommandUiSection[];
  footer?: string;
  width?: number;
};

@Injectable()
export class CommandUiService {
  panel(options: CommandPanelOptions): string {
    const terminalWidth = Math.max(20, process.stdout.columns || 80);
    const requestedWidth = options.width || terminalWidth;
    const minimumWidth = Math.min(24, terminalWidth);
    const width = Math.max(minimumWidth, Math.min(requestedWidth, terminalWidth, 100));
    const innerWidth = width - 4;
    const lines: string[] = [];
    const border = Colors.subtle;

    lines.push(`${border}${Box.topLeft}${Box.horizontal.repeat(width - 2)}${Box.topRight}${Colors.reset}`);
    lines.push(this.row(`${colorize(options.title, 'secondary')}${options.subtitle ? ` ${colorize(options.subtitle, 'muted')}` : ''}`, innerWidth, border));

    for (const section of options.sections || []) {
      lines.push(`${border}${Box.leftT}${Box.horizontal.repeat(width - 2)}${Box.rightT}${Colors.reset}`);
      if (section.title) {
        lines.push(this.row(colorize(section.title.toUpperCase(), 'muted'), innerWidth, border));
      }
      for (const row of section.rows || []) {
        const label = colorize(row.label.padEnd(14), 'muted');
        const hint = row.hint ? ` ${colorize(row.hint, 'subtle')}` : '';
        lines.push(this.row(`${label} ${row.value}${hint}`, innerWidth, border));
      }
      for (const line of section.lines || []) {
        lines.push(this.row(line, innerWidth, border));
      }
    }

    if (options.footer) {
      lines.push(`${border}${Box.leftT}${Box.horizontal.repeat(width - 2)}${Box.rightT}${Colors.reset}`);
      lines.push(this.row(colorize(options.footer, 'subtle'), innerWidth, border));
    }

    lines.push(`${border}${Box.bottomLeft}${Box.horizontal.repeat(width - 2)}${Box.bottomRight}${Colors.reset}`);
    return `\r\n${lines.join('\r\n')}\r\n`;
  }

  list(title: string, items: Array<{ name: string; description?: string; meta?: string }>, emptyMessage: string): string {
    if (items.length === 0) {
      return this.panel({
        title,
        sections: [{ lines: [colorize(emptyMessage, 'muted')] }],
      });
    }

    const maxName = Math.min(24, Math.max(...items.map((item) => visibleWidth(item.name)), 4));
    return this.panel({
      title,
      sections: [
        {
          lines: items.map((item) => {
            const name = colorize(padVisible(truncateVisible(item.name, maxName), maxName), 'cyan');
            const description = item.description ? colorize(truncateVisible(item.description, 52), 'muted') : '';
            const meta = item.meta ? ` ${colorize(item.meta, 'subtle')}` : '';
            return `${colorize(Icons.bullet, 'primary')} ${name}  ${description}${meta}`;
          }),
        },
      ],
    });
  }

  success(message: string): string {
    return this.status('success', message);
  }

  warning(message: string): string {
    return this.status('warning', message);
  }

  error(message: string): string {
    return this.status('error', message);
  }

  private status(tone: Tone, message: string): string {
    const icon = tone === 'success' ? Icons.check : tone === 'error' ? Icons.cross : '!';
    const color: keyof typeof Colors = tone === 'success' ? 'success' : tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : 'muted';
    return `\r\n  ${colorize(icon, color)} ${colorize(message, color)}\r\n\r\n`;
  }

  private row(content: string, innerWidth: number, border: string): string {
    const safe = truncateVisible(content, innerWidth);
    const padding = Math.max(0, innerWidth - visibleWidth(stripAnsi(safe)));
    return `${border}${Box.vertical}${Colors.reset} ${safe}${' '.repeat(padding)} ${border}${Box.vertical}${Colors.reset}`;
  }
}
