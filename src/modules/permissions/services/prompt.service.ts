import { Injectable } from '@nestjs/common';
import * as readline from 'readline';
import { Colors } from '../../repl/utils/theme';

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
    const answer = await this.question(`${Colors.yellow}${message}${suffix}${Colors.reset}`);

    if (!answer.trim()) return defaultValue;

    return answer.toLowerCase().startsWith('y');
  }

  async choice<T extends string>(
    message: string,
    choices: { key: T; label: string; description?: string }[],
  ): Promise<T> {
    console.log(`\n${Colors.cyan}${message}${Colors.reset}`);
    console.log('');

    choices.forEach((choice, index) => {
      const desc = choice.description ? `${Colors.dim} - ${choice.description}${Colors.reset}` : '';
      console.log(`  ${Colors.white}${index + 1}.${Colors.reset} ${Colors.bold}${choice.label}${Colors.reset}${desc}`);
    });

    console.log('');

    while (true) {
      const answer = await this.question(
        `${Colors.yellow}Choose (1-${choices.length}):${Colors.reset}`,
      );
      const index = parseInt(answer) - 1;

      if (index >= 0 && index < choices.length) {
        return choices[index].key;
      }

      console.log(`${Colors.red}Invalid choice. Please try again.${Colors.reset}`);
    }
  }

  warn(message: string): void {
    console.log(`${Colors.yellow}  ${message}${Colors.reset}`);
  }

  error(message: string): void {
    console.log(`${Colors.red}  ${message}${Colors.reset}`);
  }

  success(message: string): void {
    console.log(`${Colors.green}  ${message}${Colors.reset}`);
  }

  info(message: string): void {
    console.log(`${Colors.blue}  ${message}${Colors.reset}`);
  }

  close(): void {
  }
}
