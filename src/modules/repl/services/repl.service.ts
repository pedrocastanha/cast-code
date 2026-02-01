import { Injectable } from '@nestjs/common';
import * as readline from 'readline';
import { DeepAgentService } from '../../core/services/deep-agent.service';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

@Injectable()
export class ReplService {
  private rl: readline.Interface | null = null;

  constructor(private readonly deepAgent: DeepAgentService) {}

  async start() {
    this.printBanner();

    const initResult = await this.deepAgent.initialize();

    if (initResult.projectPath) {
      this.print(`${COLORS.green}Project detected:${COLORS.reset} ${initResult.projectPath}`);
    }

    this.print(
      `${COLORS.dim}Loaded ${initResult.agentCount} agents, ${initResult.toolCount} tools${COLORS.reset}`,
    );
    this.print('');

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      completer: this.completer.bind(this),
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    this.prompt();
  }

  private printBanner() {
    console.log('');
    console.log(
      `${COLORS.cyan}${COLORS.bright}╭─────────────────────────────────╮${COLORS.reset}`,
    );
    console.log(
      `${COLORS.cyan}${COLORS.bright}│           CAST CODE             │${COLORS.reset}`,
    );
    console.log(
      `${COLORS.cyan}${COLORS.bright}│     Multi-Agent CLI Assistant   │${COLORS.reset}`,
    );
    console.log(
      `${COLORS.cyan}${COLORS.bright}╰─────────────────────────────────╯${COLORS.reset}`,
    );
    console.log('');
    console.log(`${COLORS.dim}Type your message or use commands:${COLORS.reset}`);
    console.log(`${COLORS.dim}  /help   - Show help${COLORS.reset}`);
    console.log(`${COLORS.dim}  /clear  - Clear conversation${COLORS.reset}`);
    console.log(`${COLORS.dim}  /exit   - Exit${COLORS.reset}`);
    console.log('');
  }

  private prompt() {
    this.rl?.question(`${COLORS.cyan}>${COLORS.reset} `, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.prompt();
        return;
      }

      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed);
      } else {
        await this.handleMessage(trimmed);
      }

      this.prompt();
    });
  }

  private async handleCommand(command: string) {
    const [cmd] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        this.printHelp();
        break;
      case 'clear':
        this.deepAgent.clearHistory();
        console.clear();
        this.printBanner();
        this.print(`${COLORS.green}Conversation cleared${COLORS.reset}`);
        break;
      case 'exit':
      case 'quit':
        this.print(`${COLORS.yellow}Goodbye!${COLORS.reset}`);
        process.exit(0);
      default:
        this.print(`${COLORS.red}Unknown command: ${cmd}${COLORS.reset}`);
        this.print(`${COLORS.dim}Type /help for available commands${COLORS.reset}`);
    }
  }

  private async handleMessage(message: string) {
    try {
      process.stdout.write(`\n${COLORS.magenta}Cast:${COLORS.reset} `);

      for await (const chunk of this.deepAgent.chat(message)) {
        process.stdout.write(chunk);
      }

      console.log('\n');
    } catch (error) {
      this.print(`\n${COLORS.red}Error: ${(error as Error).message}${COLORS.reset}\n`);
    }
  }

  private printHelp() {
    console.log('');
    console.log(`${COLORS.bright}Commands:${COLORS.reset}`);
    console.log(`  ${COLORS.cyan}/help${COLORS.reset}   - Show this help message`);
    console.log(`  ${COLORS.cyan}/clear${COLORS.reset}  - Clear conversation history`);
    console.log(`  ${COLORS.cyan}/exit${COLORS.reset}   - Exit the application`);
    console.log('');
    console.log(`${COLORS.bright}Usage:${COLORS.reset}`);
    console.log('  Just type your message and press Enter.');
    console.log('  Cast will use appropriate subagents for specialized tasks.');
    console.log('');
  }

  private print(message: string) {
    console.log(message);
  }

  private completer(line: string): [string[], string] {
    const commands = ['/help', '/clear', '/exit', '/quit'];

    if (!line.startsWith('/')) {
      return [[], line];
    }

    const hits = commands.filter((cmd) => cmd.startsWith(line));
    return [hits.length ? hits : commands, line];
  }

  stop() {
    this.rl?.close();
  }
}
