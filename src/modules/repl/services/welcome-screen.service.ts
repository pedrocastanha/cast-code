import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../utils/theme';

export interface WelcomeScreenContext {
  projectPath?: string;
  model: string;
  toolCount: number;
  agentCount: number;
}

const stripAnsi = (str: string): string => {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
};

const visiblePadEnd = (str: string, targetLength: number): string => {
  const visibleLength = stripAnsi(str).length;
  const padding = targetLength - visibleLength;
  return padding > 0 ? str + ' '.repeat(padding) : str;
};

@Injectable()
export class WelcomeScreenService {
  constructor() {}

  printWelcomeScreen(context: WelcomeScreenContext): void {
    const width = 56;
    const innerWidth = width - 4;

    console.log('');

    console.log(
      colorize(Box.topLeft + Box.horizontal.repeat(innerWidth + 2) + Box.topRight, 'primary')
    );

    const logoText = '✦ CAST CODE ✦';
    const logoPadding = Math.floor((innerWidth - logoText.length) / 2);
    console.log(
      colorize(Box.vertical, 'primary') + ' ' +
      ' '.repeat(logoPadding) +
      colorize(logoText, 'bold') +
      ' '.repeat(innerWidth - logoPadding - logoText.length) +
      ' ' + colorize(Box.vertical, 'primary')
    );

    const subtitle = 'Multi-Agent CLI Assistant';
    const subPadding = Math.floor((innerWidth - subtitle.length) / 2);
    console.log(
      colorize(Box.vertical, 'primary') + ' ' +
      ' '.repeat(subPadding) +
      colorize(subtitle, 'muted') +
      ' '.repeat(innerWidth - subPadding - subtitle.length) +
      ' ' + colorize(Box.vertical, 'primary')
    );

    console.log(
      colorize(Box.leftT + Box.horizontal.repeat(innerWidth + 2) + Box.rightT, 'primary')
    );

    const labelColor = 'muted' as const;
    const maxLabel = 9;
    
    const contentWidth = innerWidth - 2;
    
    const modelLine = ` ${colorize('Model:'.padEnd(maxLabel), labelColor)}${colorize(context.model, 'cyan')} `;
    console.log(
      colorize(Box.vertical, 'primary') +
      visiblePadEnd(modelLine, innerWidth) +
      colorize(Box.vertical, 'primary')
    );

    if (context.projectPath) {
      const projectLine = ` ${colorize('Project:'.padEnd(maxLabel), labelColor)}${colorize(context.projectPath, 'accent')} `;
      console.log(
        colorize(Box.vertical, 'primary') +
        visiblePadEnd(projectLine, innerWidth) +
        colorize(Box.vertical, 'primary')
      );
    }

    const toolsLine = ` ${colorize('Tools:'.padEnd(maxLabel), labelColor)}${colorize(context.toolCount.toString(), 'green')} ${colorize('available', labelColor)} `;
    console.log(
      colorize(Box.vertical, 'primary') +
      visiblePadEnd(toolsLine, innerWidth) +
      colorize(Box.vertical, 'primary')
    );

    const agentsLine = ` ${colorize('Agents:'.padEnd(maxLabel), labelColor)}${colorize(context.agentCount.toString(), 'magenta')} ${colorize('ready', labelColor)} `;
    console.log(
      colorize(Box.vertical, 'primary') +
      visiblePadEnd(agentsLine, innerWidth) +
      colorize(Box.vertical, 'primary')
    );

    console.log(
      colorize(Box.leftT + Box.horizontal.repeat(innerWidth + 2) + Box.rightT, 'primary')
    );

    const tips = [
      { cmd: '/help', desc: 'Show all commands' },
      { cmd: '@file', desc: 'Add file context' },
      { cmd: 'Tab',   desc: 'Accept suggestions' },
    ];

    for (const tip of tips) {
      const tipLine = ` ${colorize(Icons.arrow, 'primary')} ${colorize(tip.cmd, 'cyan')} ${colorize(tip.desc, 'muted')} `;
      console.log(
        colorize(Box.vertical, 'primary') +
        visiblePadEnd(tipLine, innerWidth) +
        colorize(Box.vertical, 'primary')
      );
    }

    console.log(
      colorize(Box.bottomLeft + Box.horizontal.repeat(innerWidth + 2) + Box.bottomRight, 'primary')
    );
    console.log('');
  }

  printBanner(): void {
    console.log('');
    console.log(colorize('  ✦ CAST CODE ✦', 'primary'));
    console.log('');
  }

  printStatusLine(context: {
    model: string;
    branch?: string;
    hasChanges?: boolean;
    messageCount?: number;
  }): void {
    const parts: string[] = [];
    
    parts.push(colorize(Icons.robot, 'primary') + ' ' + colorize(context.model, 'cyan'));
    
    if (context.branch) {
      const branchIcon = context.hasChanges ? Icons.circle : Icons.branch;
      const branchColor = context.hasChanges ? 'warning' : 'success';
      parts.push(colorize(branchIcon, branchColor) + ' ' + colorize(context.branch, 'muted'));
    }
    
    if (context.messageCount && context.messageCount > 0) {
      parts.push(colorize(Icons.bullet, 'muted') + ' ' + colorize(context.messageCount.toString(), 'muted') + ' msgs');
    }

    console.log('\n  ' + parts.join('  ') + '\n');
  }
}
