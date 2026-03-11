import { Injectable } from '@nestjs/common';
import { colorize, Icons } from '../utils/theme';

export interface WelcomeScreenContext {
  projectPath?: string;
  model: string;
  toolCount: number;
  agentCount: number;
}

@Injectable()
export class WelcomeScreenService {
  constructor() {}

  printWelcomeScreen(context: WelcomeScreenContext): void {
    const w = (s: string) => process.stdout.write(s + '\r\n');
    const ww = (s: string) => process.stdout.write(s);

    w('');

    // Logo — minimal, clean
    w(`  ${colorize('cast', 'primary')}${colorize('code', 'bold')}  ${colorize('multi-agent CLI', 'muted')}`);
    w('');

    // Model & directory info
    const maxLabel = 5;
    const labelColor = 'muted' as const;

    w(`  ${colorize('model', labelColor)}  ${colorize(context.model, 'cyan')}`);

    if (context.projectPath) {
      const maxPathLen = 60;
      let displayPath = context.projectPath;
      if (displayPath.length > maxPathLen) {
        displayPath = '...' + displayPath.slice(displayPath.length - maxPathLen + 3);
      }
      // Replace home directory with ~
      const home = process.env.HOME || '';
      if (home && displayPath.startsWith(home)) {
        displayPath = '~' + displayPath.slice(home.length);
      }
      w(`  ${colorize('dir  ', labelColor)} ${colorize(displayPath, 'accent')}`);
    }

    w('');

    // Stats row
    const toolsStr = colorize(context.toolCount.toString(), 'green') + colorize(' tools', 'muted');
    const agentsStr = colorize(context.agentCount.toString(), 'magenta') + colorize(' agents', 'muted');
    w(`  ${toolsStr}    ${agentsStr}`);

    w('');

    // Key shortcuts — clean inline format
    const tip = (cmd: string, desc: string) =>
      `  ${colorize(cmd, 'cyan')} ${colorize(desc, 'muted')}`;

    w(colorize('  Quick start', 'subtle'));
    w(tip('/help', '   all commands'));
    w(tip('/init', '   map project context'));
    w(tip('@file', '   inject file into prompt'));
    w(tip('Tab', '    accept suggestion'));
    w(tip('Ctrl+C', ' cancel  ') + colorize('  Ctrl+D', 'cyan') + colorize(' exit', 'muted'));

    w('');
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
