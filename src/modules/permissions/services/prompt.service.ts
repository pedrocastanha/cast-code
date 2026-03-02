import { Injectable } from '@nestjs/common';
import { input, confirm, select } from '@inquirer/prompts';
import { Colors } from '../../repl/utils/theme';

@Injectable()
export class PromptService {
  async question(query: string): Promise<string> {
    const answer = await input({
      message: `${Colors.primary}${query}${Colors.reset}`,
    });
    return answer;
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const answer = await confirm({
      message: `${Colors.yellow}${message}${Colors.reset}`,
      default: defaultValue,
    });
    return answer;
  }

  async choice<T extends string>(
    message: string,
    choices: { key: T; label: string; description?: string }[],
  ): Promise<T> {
    const answer = await select({
      message: `${Colors.cyan}${message}${Colors.reset}`,
      choices: choices.map((choice) => ({
        value: choice.key,
        name: `${Colors.bold}${choice.label}${Colors.reset}`,
        description: choice.description ? `${Colors.dim}${choice.description}${Colors.reset}` : undefined,
      })),
    });
    return answer;
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

  close(): void { }
}
