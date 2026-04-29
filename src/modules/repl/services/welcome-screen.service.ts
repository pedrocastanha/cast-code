import { Injectable } from '@nestjs/common';
import { colorize, Box, Icons, Colors } from '../utils/theme';
import { CAST_COMMANDS } from '../../../ui/cast-design/tokens';
import { horizontalRule, padVisible, stripAnsi, wrapRow } from '../../../ui/cast-design/cli-renderer';

export interface WelcomeScreenContext {
  projectPath?: string;
  model: string;
  endpointLabel: string;
  modelProfile: string;
  toolCount: number;
  agentCount: number;
}

@Injectable()
export class WelcomeScreenService {
  constructor() {}

  printWelcomeScreen(context: WelcomeScreenContext): void {
    const innerWidth = Math.min(Math.max((process.stdout.columns || 100) - 6, 64), 96);
    const home = process.env.HOME || '';
    const borderColor = Colors.subtle;
    const top = horizontalRule(innerWidth, Box.topLeft, Box.topRight, borderColor);
    const middle = horizontalRule(innerWidth, Box.leftT, Box.rightT, borderColor);
    const bottom = horizontalRule(innerWidth, Box.bottomLeft, Box.bottomRight, borderColor);

    let displayPath = context.projectPath || process.cwd();
    if (home && displayPath.startsWith(home)) displayPath = '~' + displayPath.slice(home.length);
    const projectValue = stripAnsi(displayPath).length > innerWidth - 14
      ? '...' + displayPath.slice(-(innerWidth - 17))
      : displayPath;

    const rows = [
      this.centerRow(
        `${colorize(Icons.circle, 'red')} ${colorize(Icons.circle, 'warning')} ${colorize(Icons.circle, 'green')}   ${colorize('CAST CODE', 'secondary')} ${colorize('Multi-Agent CLI Assistant', 'subtle')}`,
        innerWidth,
      ),
      middle,
      wrapRow(`${this.label('model')} ${colorize(context.model, 'secondary')}`, innerWidth, borderColor),
      wrapRow(`${this.label('endpoint')} ${colorize(context.endpointLabel, 'cyan')}`, innerWidth, borderColor),
      wrapRow(`${this.label('profile')} ${colorize(context.modelProfile, 'green')}`, innerWidth, borderColor),
      wrapRow(`${this.label('project')} ${colorize(projectValue, 'green')}`, innerWidth, borderColor),
      wrapRow(`${this.label('tools')} ${colorize(context.toolCount.toString(), 'warning')} ${colorize('available', 'muted')}`, innerWidth, borderColor),
      wrapRow(`${this.label('agents')} ${colorize(context.agentCount.toString(), 'warning')} ${colorize('ready', 'muted')}`, innerWidth, borderColor),
      middle,
      wrapRow(colorize('QUICK COMMANDS', 'subtle'), innerWidth, borderColor),
      ...CAST_COMMANDS.map(({ key, description }) =>
        wrapRow(`${colorize(key.padEnd(8), 'cyan')} ${colorize(description, 'muted')}`, innerWidth, borderColor),
      ),
      middle,
      wrapRow(colorize('ACTIVE AGENTS', 'subtle'), innerWidth, borderColor),
      wrapRow(`${colorize(Icons.circle, 'green')} ${colorize('planner'.padEnd(10), 'cyan')} ${colorize('idle', 'subtle')}`, innerWidth, borderColor),
      wrapRow(`${colorize(Icons.circle, 'green')} ${colorize('coder'.padEnd(10), 'cyan')} ${colorize('idle', 'subtle')}`, innerWidth, borderColor),
      wrapRow(`${colorize(Icons.circle, 'subtle')} ${colorize('reviewer'.padEnd(10), 'cyan')} ${colorize('off', 'subtle')}`, innerWidth, borderColor),
    ];

    console.log('');
    console.log(top);
    rows.forEach((row) => console.log(row));
    console.log(bottom);
    console.log('');
    process.stdout.write(`  ${colorize('›', 'cyan')} ${colorize('type your prompt below', 'subtle')}\r\n\r\n`);
  }

  printBanner(): void {
    process.stdout.write('\r\n');
    process.stdout.write(
      `  ${colorize('CAST', 'secondary')} ${colorize('CODE', 'cyan')}` + '\r\n'
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

    parts.push(colorize('tokens', 'subtle') + ' ' + colorize((context.messageCount ?? 0).toString(), 'secondary'));
    parts.push(colorize('model', 'subtle') + ' ' + colorize(context.model, 'cyan'));

    if (context.branch) {
      const branchColor = context.hasChanges ? 'warning' : 'success';
      const branchIcon = context.hasChanges ? Icons.circle : Icons.branch;
      parts.push(colorize(branchIcon, branchColor) + ' ' + colorize(context.branch, 'muted'));
    }

    process.stdout.write('\r\n  ' + parts.join('  ') + '\r\n\r\n');
  }

  private label(text: string): string {
    return colorize(padVisible(text, 8), 'muted');
  }

  private centerRow(content: string, innerWidth: number): string {
    return wrapRow(padVisible(content, innerWidth, 'center'), innerWidth, Colors.subtle);
  }
}
