import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box } from '../utils/theme';

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
    console.log('');
    console.log(colorize('  ╭────────────────────────────────────────────────────╮', 'primary'));
    console.log(colorize('  │', 'primary') + '          ' + colorize('CAST CODE', 'bold') + '                          ' + colorize('│', 'primary'));
    console.log(colorize('  │', 'primary') + '     Multi-Agent CLI Assistant              ' + colorize('│', 'primary'));
    console.log(colorize('  ╰────────────────────────────────────────────────────╯', 'primary'));
    console.log('');

    console.log(`  ${colorize('Model:', 'muted')} ${context.model}`);
    if (context.projectPath) {
      console.log(`  ${colorize('Project:', 'muted')} ${context.projectPath}`);
    }
    console.log(`  ${colorize('Tools:', 'muted')} ${context.toolCount} available`);
    console.log(`  ${colorize('Agents:', 'muted')} ${context.agentCount} ready`);
    console.log('');

    console.log(colorize('  Tips for getting started:', 'dim'));
    console.log(`  ${colorize('•', 'primary')} ${colorize('/help', 'cyan')} for commands`);
    console.log(`  ${colorize('•', 'primary')} ${colorize('@file', 'cyan')} to add context`);
    console.log(`  ${colorize('•', 'primary')} ${colorize('Tab', 'cyan')} to accept suggestions`);
    console.log('');
  }

  printBanner(): void {
    console.log('');
    console.log(colorize('  CAST CODE', 'primary'));
    console.log('');
  }
}
