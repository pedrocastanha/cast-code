import * as readline from 'node:readline';
import type { ChoiceOption, ISmartInput } from './smart-input';

export interface HeadlessSmartInputOptions {
  /** Auto-confirm every prompt (--yes flag or non-TTY stdin). */
  autoYes: boolean;
  /** Injectable prompt function for tests. Defaults to readline on stdin/stdout. */
  ask?: (prompt: string) => Promise<string>;
}

/**
 * ISmartInput implementation for headless CLI subcommands (cast up, cast split-up).
 * No live region, no raw mode: plain stdout writes and readline prompts.
 */
export class HeadlessSmartInput implements ISmartInput {
  constructor(private readonly opts: HeadlessSmartInputOptions) {}

  async question(query: string): Promise<string> {
    if (this.opts.autoYes) return '';
    return this.prompt(`${query} `);
  }

  async askChoice(message: string, choices: ChoiceOption[]): Promise<string> {
    if (choices.length === 0) throw new Error('askChoice requires at least one choice');

    if (this.opts.autoYes) {
      return (choices.find((c) => c.key === 'y') ?? choices[0]).key;
    }

    process.stdout.write(`\n${message}\n`);
    choices.forEach((c, i) => {
      const desc = c.description ? ` - ${c.description}` : '';
      process.stdout.write(`  ${i + 1}. ${c.label} [${c.key}]${desc}\n`);
    });

    while (true) {
      const answer = (await this.prompt(`Choose (1-${choices.length} or key): `)).trim().toLowerCase();
      const byIndex = Number.parseInt(answer, 10);
      if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= choices.length) {
        return choices[byIndex - 1].key;
      }
      const byKey = choices.find((c) => c.key.toLowerCase() === answer);
      if (byKey) return byKey.key;
      process.stdout.write('Invalid choice, try again.\n');
    }
  }

  printExternal(text: string): void { process.stdout.write(text); }
  writeOutputLine(line: string): void { process.stdout.write(line + '\n'); }
  rewriteLinesAbove(_lineCount: number, content: string): void { process.stdout.write(content); }

  // Lifecycle/rendering: no live region in headless mode.
  pause(): void {}
  resume(): void {}
  start(): void {}
  destroy(): void {}
  refresh(): void {}
  showPrompt(): void {}
  enterPassiveMode(): void {}
  exitPassiveMode(): void {}
  setFooterStatus(_status: { mode: string; model: string; hints: string[] }): void {}

  private prompt(query: string): Promise<string> {
    if (this.opts.ask) return this.opts.ask(query);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise<string>((resolve) => {
      rl.question(query, (answer) => { rl.close(); resolve(answer); });
    });
  }
}
