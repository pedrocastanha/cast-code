import { Injectable } from '@nestjs/common';
import * as readline from 'readline';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

@Injectable()
export class PromptService {
  async question(query: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
      });

      rl.question(query + ' ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const suffix = defaultValue ? ' [Y/n]' : ' [y/N]';
    const answer = await this.question(`${C.yellow}${message}${suffix}${C.reset}`);

    if (!answer.trim()) return defaultValue;

    return answer.toLowerCase().startsWith('y');
  }

  async choice<T extends string>(
    message: string,
    choices: { key: T; label: string; description?: string }[],
  ): Promise<T> {
    console.log(`\n${C.cyan}${message}${C.reset}`);
    console.log('');

    choices.forEach((choice, index) => {
      const desc = choice.description ? `${C.dim} - ${choice.description}${C.reset}` : '';
      console.log(`  ${C.white}${index + 1}.${C.reset} ${C.bold}${choice.label}${C.reset}${desc}`);
    });

    console.log('');

    while (true) {
      const answer = await this.question(
        `${C.yellow}Choose (1-${choices.length}):${C.reset}`,
      );
      const index = parseInt(answer) - 1;

      if (index >= 0 && index < choices.length) {
        return choices[index].key;
      }

      console.log(`${C.red}Invalid choice. Please try again.${C.reset}`);
    }
  }

  warn(message: string): void {
    console.log(`${C.yellow}  ${message}${C.reset}`);
  }

  error(message: string): void {
    console.log(`${C.red}  ${message}${C.reset}`);
  }

  success(message: string): void {
    console.log(`${C.green}  ${message}${C.reset}`);
  }

  info(message: string): void {
    console.log(`${C.blue}  ${message}${C.reset}`);
  }

  close(): void {
  }
}
