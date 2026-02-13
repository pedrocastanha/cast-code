import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { ConfigService } from '../../../../common/services/config.service';
import { DeepAgentService } from '../../../core/services/deep-agent.service';

@Injectable()
export class ReplCommandsService {
  constructor(
    private readonly deepAgent: DeepAgentService,
    private readonly configService: ConfigService,
  ) {}

  printHelp(): void {
    const header = (text: string, icon?: string) => {
      const iconStr = icon ? colorize(icon + ' ', 'accent') : '';
      return '\n' + iconStr + colorize(text, 'bold') + '\n' + colorize(Box.horizontal.repeat(text.length + (icon ? 2 : 0)), 'subtle') + '\n';
    };

    const cmd = (name: string, desc: string, nameWidth = 16) => {
      const paddedName = name.padEnd(nameWidth);
      return `  ${colorize(paddedName, 'cyan')} ${colorize(desc, 'muted')}\r\n`;
    };

    process.stdout.write('\r\n');
    
    process.stdout.write(header('Commands', Icons.diamond));
    process.stdout.write(cmd('/help', 'Show this help'));
    process.stdout.write(cmd('/clear', 'Clear conversation'));
    process.stdout.write(cmd('/compact', 'Compact history'));
    process.stdout.write(cmd('/exit', 'Exit'));

    process.stdout.write(header('Git', Icons.branch));
    process.stdout.write(cmd('/status', 'Git status'));
    process.stdout.write(cmd('/diff', 'Git diff'));
    process.stdout.write(cmd('/log', 'Git log (recent 15)'));
    process.stdout.write(cmd('/commit [msg]', 'Commit (AI-assisted or manual)'));
    process.stdout.write(cmd('/up', 'Smart commit & push'));
    process.stdout.write(cmd('/split-up', 'Split into multiple commits'));
    process.stdout.write(cmd('/pr', 'Create PR with AI description'));
    process.stdout.write(cmd('/review [files]', 'Code review'));
    process.stdout.write(cmd('/fix <file>', 'Auto-fix code issues'));
    process.stdout.write(cmd('/ident', 'Format all code files'));
    process.stdout.write(cmd('/release [tag]', 'Generate release notes'));

    process.stdout.write(header('Agents & Skills', Icons.robot));
    process.stdout.write(cmd('/agents', 'List agents'));
    process.stdout.write(cmd('/agents create', 'Create new agent'));
    process.stdout.write(cmd('/skills', 'List skills'));
    process.stdout.write(cmd('/skills create', 'Create new skill'));

    process.stdout.write(header('Info', Icons.search));
    process.stdout.write(cmd('/tools', 'List available tools'));
    process.stdout.write(cmd('/context', 'Session info'));
    process.stdout.write(cmd('/mentions', 'Mentions help (@)'));

    process.stdout.write(header('Config', Icons.gear));
    process.stdout.write(cmd('/model', 'Show/change model'));
    process.stdout.write(cmd('/config', 'Show configuration'));
    process.stdout.write(cmd('/init', 'Initialize .cast/ directory'));

    process.stdout.write(header('MCP', Icons.cloud));
    process.stdout.write(cmd('/mcp list', 'List MCP servers'));
    process.stdout.write(cmd('/mcp tools', 'List MCP tools'));
    process.stdout.write(cmd('/mcp add', 'Add new MCP server'));
    process.stdout.write(cmd('/mcp help', 'MCP setup guide'));

    process.stdout.write(header('Mentions', Icons.file));
    process.stdout.write(cmd('@file.ts', 'Inject file content'));
    process.stdout.write(cmd('@dir/', 'Inject directory listing'));
    process.stdout.write(cmd('@git:status', 'Inject git status'));

    process.stdout.write(header('Tips', Icons.lightbulb));
    process.stdout.write(`  ${colorize('Type /', 'dim')}     Commands appear as you type\r\n`);
    process.stdout.write(`  ${colorize('Type @', 'dim')}     File suggestions appear\r\n`);
    process.stdout.write(`  ${colorize('Tab', 'dim')}        Accept suggestion\r\n`);
    process.stdout.write(`  ${colorize('↑↓', 'dim')}         Navigate suggestions\r\n`);
    process.stdout.write(`  ${colorize('Ctrl+C', 'dim')}     Cancel operation\r\n`);
    process.stdout.write(`  ${colorize('Ctrl+D', 'dim')}     Exit\r\n`);
    
    process.stdout.write('\r\n');
  }

  cmdClear(welcomeScreen: { printBanner: () => void }): void {
    this.deepAgent.clearHistory();
    process.stdout.write('\x1b[2J\x1b[H');
    welcomeScreen.printBanner();
    process.stdout.write(`${Colors.green}  Conversation cleared${Colors.reset}\r\n`);
  }

  cmdContext(): void {
    process.stdout.write('\r\n');
    process.stdout.write(colorize(Icons.circle + ' ', 'accent') + colorize('Session', 'bold') + '\r\n');
    process.stdout.write(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n');
    process.stdout.write(`  ${colorize('Messages:', 'muted')} ${this.deepAgent.getMessageCount()}\r\n`);
    process.stdout.write(`  ${colorize('Tokens:', 'muted')}   ${colorize(this.deepAgent.getTokenCount().toLocaleString(), 'cyan')}\r\n`);
    process.stdout.write(`  ${colorize('CWD:', 'muted')}      ${colorize(process.cwd(), 'accent')}\r\n`);
    process.stdout.write(`  ${colorize('Model:', 'muted')}    ${colorize(this.configService.getProvider() + '/' + this.configService.getModel(), 'cyan')}\r\n`);
    process.stdout.write('\r\n');
  }

  cmdConfig(): void {
    const fs = require('fs');
    const path = require('path');
    const castDir = path.join(process.cwd(), '.cast');
    const hasCastDir = fs.existsSync(castDir);
    
    process.stdout.write('\r\n');
    process.stdout.write(colorize(Icons.gear + ' ', 'accent') + colorize('Configuration', 'bold') + '\r\n');
    process.stdout.write(colorize(Box.horizontal.repeat(25), 'subtle') + '\r\n');
    process.stdout.write(`  ${colorize('Provider:', 'muted')}    ${colorize(this.configService.getProvider(), 'cyan')}\r\n`);
    process.stdout.write(`  ${colorize('Model:', 'muted')}       ${colorize(this.configService.getModel(), 'cyan')}\r\n`);
    process.stdout.write(`  ${colorize('Temp:', 'muted')}        ${colorize(this.configService.getTemperature().toString(), 'cyan')}\r\n`);
    process.stdout.write(`  ${colorize('CWD:', 'muted')}         ${colorize(process.cwd(), 'accent')}\r\n`);
    process.stdout.write(`  ${colorize('Messages:', 'muted')}   ${this.deepAgent.getMessageCount()}\r\n`);
    process.stdout.write(`  ${colorize('.cast/:', 'muted')}     ${hasCastDir ? colorize('✓ found', 'success') : colorize('not found (use /init)', 'warning')}\r\n`);
    process.stdout.write('\r\n');
  }

  cmdModel(args: string[]): void {
    if (args.length === 0) {
      process.stdout.write('\r\n' + colorize(Icons.robot + ' ', 'accent') + colorize('Current Model', 'bold') + '\r\n');
      process.stdout.write(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n');
      process.stdout.write(`  Provider: ${colorize(this.configService.getProvider(), 'cyan')}\r\n`);
      process.stdout.write(`  Model:    ${colorize(this.configService.getModel(), 'cyan')}\r\n\r\n`);
      process.stdout.write(`  ${colorize('Tip:', 'muted')} Set via env vars or .cast/config.md\r\n\r\n`);
      return;
    }
    process.stdout.write(`${Colors.yellow}  Model change requires restart${Colors.reset}\r\n`);
  }

  cmdInit(): void {
    const fs = require('fs');
    const path = require('path');
    const castDir = path.join(process.cwd(), '.cast');

    if (fs.existsSync(castDir)) {
      process.stdout.write(`  ${Colors.dim}.cast/ already exists${Colors.reset}\r\n`);
      return;
    }

    fs.mkdirSync(castDir, { recursive: true });
    fs.mkdirSync(path.join(castDir, 'definitions', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(castDir, 'definitions', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(castDir, 'mcp'), { recursive: true });

    fs.writeFileSync(
      path.join(castDir, 'config.md'),
      [
        '---',
        'model: gpt-4.1',
        'temperature: 0.1',
        '---',
        '',
        '# Project Context',
        '',
        'Describe your project here.',
        '',
      ].join('\n'),
    );

    process.stdout.write(`${Colors.green}  Initialized .cast/ directory${Colors.reset}\r\n`);
    process.stdout.write(`  ${Colors.dim}Created: config.md, definitions/agents/, definitions/skills/, mcp/${Colors.reset}\r\n\r\n`);
  }

  cmdMentionsHelp(): void {
    process.stdout.write('\r\n');
    process.stdout.write(colorize(Icons.file + ' ', 'accent') + colorize('Mentions — inject context with @', 'bold') + '\r\n');
    process.stdout.write(colorize(Box.horizontal.repeat(35), 'subtle') + '\r\n');
    process.stdout.write(`  ${colorize('@path/to/file.ts', 'cyan')}   Read file content\r\n`);
    process.stdout.write(`  ${colorize('@path/to/dir/', 'cyan')}      List directory\r\n`);
    process.stdout.write(`  ${colorize('@https://url.com', 'cyan')}   Fetch URL\r\n`);
    process.stdout.write(`  ${colorize('@git:status', 'cyan')}        Git status\r\n`);
    process.stdout.write(`  ${colorize('@git:diff', 'cyan')}          Git diff\r\n`);
    process.stdout.write(`  ${colorize('@git:log', 'cyan')}           Git log\r\n`);
    process.stdout.write(`  ${colorize('@git:branch', 'cyan')}        List branches\r\n`);
    process.stdout.write('\r\n');
    process.stdout.write(`  ${colorize('Example:', 'muted')} "Explain this @src/main.ts"\r\n`);
    process.stdout.write(`  ${colorize('Tip:', 'muted')} Type @ and suggestions will appear\r\n`);
    process.stdout.write('\r\n');
  }
}
