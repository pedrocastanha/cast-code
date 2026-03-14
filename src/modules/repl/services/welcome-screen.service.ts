import { Injectable } from '@nestjs/common';
import { colorize, Box, Icons, Colors } from '../utils/theme';

export interface WelcomeScreenContext {
  projectPath?: string;
  model: string;
  toolCount: number;
  agentCount: number;
}

const stripAnsi = (str: string): string => str.replace(/\x1b\[[0-9;]*m/g, '');

@Injectable()
export class WelcomeScreenService {
  constructor() {}

  printWelcomeScreen(context: WelcomeScreenContext): void {
    // Layout: │ + space + [CONTENT area = innerWidth chars] + space + │
    // Border: ╭ + ─.repeat(innerWidth + 2) + ╮
    // Total visible width = 1 + 1 + innerWidth + 1 + 1 = innerWidth + 4
    const innerWidth = 48;
    const labelColor = 'muted' as const;
    const maxLabel = 9;

    const border = (left: string, right: string) =>
      colorize(left + Box.horizontal.repeat(innerWidth + 2) + right, 'primary');

    // Wraps content to exactly innerWidth visible chars, with │ on both sides
    const row = (content: string) => {
      const visible = stripAnsi(content);
      const pad = Math.max(0, innerWidth - visible.length);
      return (
        colorize(Box.vertical, 'primary') +
        ' ' + content + ' '.repeat(pad) + ' ' +
        colorize(Box.vertical, 'primary')
      );
    };

    const centered = (text: string, colorKey: keyof typeof Colors = 'bold') => {
      const pad = Math.floor((innerWidth - text.length) / 2);
      const rest = innerWidth - pad - text.length;
      return ' '.repeat(pad) + colorize(text, colorKey) + ' '.repeat(rest);
    };

    console.log('');
    console.log(border(Box.topLeft, Box.topRight));
    console.log(row(centered('✦ CAST CODE ✦', 'bold')));
    console.log(row(centered('Multi-Agent CLI Assistant', 'muted')));
    console.log(border(Box.leftT, Box.rightT));

    console.log(row(`${colorize('Model:'.padEnd(maxLabel), labelColor)}${colorize(context.model, 'cyan')}`));

    if (context.projectPath) {
      const home = process.env.HOME || '';
      let displayPath = context.projectPath;
      if (home && displayPath.startsWith(home)) displayPath = '~' + displayPath.slice(home.length);
      const maxPathLen = innerWidth - maxLabel - 1;
      if (stripAnsi(displayPath).length > maxPathLen) {
        displayPath = '...' + displayPath.slice(-(maxPathLen - 3));
      }
      console.log(row(`${colorize('Project:'.padEnd(maxLabel), labelColor)}${colorize(displayPath, 'accent')}`));
    }

    console.log(row(`${colorize('Tools:'.padEnd(maxLabel), labelColor)}${colorize(context.toolCount.toString(), 'green')} ${colorize('available', labelColor)}`));
    console.log(row(`${colorize('Agents:'.padEnd(maxLabel), labelColor)}${colorize(context.agentCount.toString(), 'magenta')} ${colorize('ready', labelColor)}`));

    console.log(border(Box.leftT, Box.rightT));

    const tips = [
      { cmd: '/help', desc: 'Show all commands' },
      { cmd: '/init', desc: 'Map project context' },
      { cmd: '@file', desc: 'Inject file into prompt' },
      { cmd: 'Tab',   desc: 'Accept suggestions' },
    ];

    for (const tip of tips) {
      const content = `${colorize(Icons.arrow, 'primary')} ${colorize(tip.cmd.padEnd(6), 'cyan')} ${colorize(tip.desc, 'muted')}`;
      console.log(row(content));
    }

    console.log(border(Box.bottomLeft, Box.bottomRight));
    console.log('');
  }

  printBanner(): void {
    process.stdout.write('\r\n');
    process.stdout.write(
      `  ${colorize('cast', 'primary')}${colorize('code', 'bold')}` + '\r\n'
    );
    process.stdout.write('\r\n');
  }

  printStatusLine(context: {
    model: string;
    branch?: string;
    hasChanges?: boolean;
    messageCount?: number;
  }): void {
    const parts: string[] = [];

    parts.push(colorize(context.model, 'cyan'));

    if (context.branch) {
      const branchColor = context.hasChanges ? 'warning' : 'success';
      const branchIcon = context.hasChanges ? Icons.circle : Icons.branch;
      parts.push(colorize(branchIcon, branchColor) + ' ' + colorize(context.branch, 'muted'));
    }

    if (context.messageCount && context.messageCount > 0) {
      parts.push(colorize(context.messageCount.toString(), 'muted') + ' msgs');
    }

    process.stdout.write('\r\n  ' + parts.join('  ') + '\r\n\r\n');
  }
}
