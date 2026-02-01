import { Injectable } from '@nestjs/common';
import * as readline from 'readline';
import * as chalk from 'chalk';

@Injectable()
export class PromptService {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const suffix = defaultValue ? ' [Y/n]' : ' [y/N]';
    const answer = await this.question(chalk.yellow(message + suffix));

    if (!answer.trim()) return defaultValue;

    return answer.toLowerCase().startsWith('y');
  }

  async choice<T extends string>(
    message: string,
    choices: { key: T; label: string; description?: string }[],
  ): Promise<T> {
    console.log(chalk.cyan('\n' + message));
    console.log('');

    choices.forEach((choice, index) => {
      console.log(
        chalk.white(`  ${index + 1}. `) +
          chalk.bold(choice.label) +
          (choice.description ? chalk.gray(` - ${choice.description}`) : ''),
      );
    });

    console.log('');

    while (true) {
      const answer = await this.question(chalk.yellow('Choose (1-' + choices.length + '): '));
      const index = parseInt(answer) - 1;

      if (index >= 0 && index < choices.length) {
        return choices[index].key;
      }

      console.log(chalk.red('Invalid choice. Please try again.'));
    }
  }

  async question(query: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(query + ' ', resolve);
    });
  }

  warn(message: string): void {
    console.log(chalk.yellow('⚠️  ' + message));
  }

  error(message: string): void {
    console.log(chalk.red('❌ ' + message));
  }

  success(message: string): void {
    console.log(chalk.green('✅ ' + message));
  }

  info(message: string): void {
    console.log(chalk.blue('ℹ️  ' + message));
  }

  close(): void {
    this.rl.close();
  }
}
