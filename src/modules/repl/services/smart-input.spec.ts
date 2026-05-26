import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { stripAnsi, visibleWidth } from '../../../ui/cast-design/cli-renderer';
import { Colors } from '../utils/theme';
import { SmartInput, type SmartInputOptions } from './smart-input';

const buildInput = (overrides: Partial<SmartInputOptions> = {}) => new SmartInput({
  prompt: '› ',
  promptVisibleLen: 2,
  getCommandSuggestions: () => [],
  getMentionSuggestions: () => [],
  onSubmit: () => {},
  onCancel: () => {},
  onExit: () => {},
  ...overrides,
});

function captureStdout(run: () => void): string {
  const originalWrite = process.stdout.write;
  const writes: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    run();
    return writes.join('');
  } finally {
    process.stdout.write = originalWrite;
  }
}

describe('SmartInput render layout', () => {
  test('renders the prompt row as a full-width highlighted input band', () => {
    const input = buildInput({
      getFooterLines: () => ['tab to queue message'],
    });
    (input as any).terminalWidth = 24;
    (input as any).buffer = '[Image #1]';
    (input as any).cursor = '[Image #1]'.length;

    const output = captureStdout(() => {
      (input as any).render();
    });

    assert.match(output, /\x1b\[48;5;236m/);
    assert.match(output, /› \[Image #1\] {12}\x1b\[0m\x1b\[J\r\ntab to queue message/);
  });

  test('keeps the input band active after ANSI resets in the prompt', () => {
    const input = buildInput({
      prompt: `${Colors.cyan}›${Colors.reset} `,
      promptVisibleLen: 2,
    });
    (input as any).terminalWidth = 16;

    const output = captureStdout(() => {
      (input as any).render();
    });

    assert.match(
      output,
      /\x1b\[38;5;45m›\x1b\[0m\x1b\[48;5;236m\x1b\[38;5;250m/,
      'background should be restored after the colored prompt resets ANSI styles',
    );
  });

  test('hard-wraps long input before rendering footer lines', () => {
    const input = buildInput({
      getFooterLines: () => ['footer'],
    });
    (input as any).terminalWidth = 10;
    (input as any).buffer = 'aaaaaaaaaa';
    (input as any).cursor = 10;

    const output = captureStdout(() => {
      (input as any).render();
    });

    assert.match(
      output,
      /› aaaaaaaa\x1b\[0m\r\n\x1b\[48;5;236m\x1b\[38;5;250maa {8}\x1b\[0m\x1b\[J\r\nfooter/,
      'input rows should be physically separated before footer is drawn',
    );
  });

  test('moves back over wrapped footer rows before placing the input cursor', () => {
    const input = buildInput({
      getFooterLines: () => ['1234567890123456789012345'],
    });
    (input as any).terminalWidth = 10;

    const output = captureStdout(() => {
      (input as any).render();
    });

    assert.match(
      output,
      /\x1b\[3A\x1b\[3G$/,
      'footer wraps to three visual rows, so cursor restore must move up three rows',
    );
  });

  test('shows dollar-reference suggestions and accepts the selected token', () => {
    const input = buildInput();
    ((input as any).opts as any).getReferenceSuggestions = (partial: string) => [
      { text: `$frontend${partial}`, display: `$frontend${partial}`, description: 'agent - UI work' },
    ];

    captureStdout(() => {
      (input as any).handleData('Use $');
    });

    assert.deepEqual(
      (input as any).suggestions.map((s: { text: string }) => s.text),
      ['$frontend'],
    );

    captureStdout(() => {
      (input as any).handleData('\t');
    });

    assert.equal((input as any).buffer, 'Use $frontend');
    assert.equal((input as any).cursor, 'Use $frontend'.length);
  });

  test('truncates long suggestion descriptions to the terminal width', () => {
    const input = buildInput();
    (input as any).terminalWidth = 28;
    (input as any).suggestions = [
      {
        text: '$frontend',
        display: '$frontend',
        description: 'agent - Frontend specialist for UI implementation with a very long capability summary',
      },
    ];

    const output = captureStdout(() => {
      (input as any).render();
    });

    const visibleLines = stripAnsi(output)
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    assert(
      visibleLines.every((line) => visibleWidth(line) <= 28),
      `all suggestion lines should fit the terminal width:\n${visibleLines.join('\n')}`,
    );
  });
});

describe('SmartInput choice menu', () => {
  test('arrow down and enter select the highlighted choice', async () => {
    const input = buildInput();
    const originalStdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const originalWrite = process.stdout.write;
    const writes: string[] = [];

    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const selected = input.askChoice('Effort', [
        { key: 'fast', label: 'Fast', description: 'cheap' },
        { key: 'balanced', label: 'Balanced', description: 'default' },
      ]);

      (input as any).handleData('\x1b[B');
      (input as any).handleData('\r');

      assert.equal(await selected, 'balanced');
      assert.match(writes.join(''), /Effort/);
      assert.match(writes.join(''), /Balanced/);
    } finally {
      process.stdout.write = originalWrite;
      if (originalStdinTty) Object.defineProperty(process.stdin, 'isTTY', originalStdinTty);
      if (originalStdoutTty) Object.defineProperty(process.stdout, 'isTTY', originalStdoutTty);
    }
  });

  test('tab resolves the highlighted choice alternate action', async () => {
    const input = buildInput();
    const originalStdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const originalWrite = process.stdout.write;
    const originalCi = process.env.CI;
    const writes: string[] = [];

    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.CI;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const selected = input.askChoice('Bridge provider', [
        { key: 'claude', label: 'Claude CLI', tabKey: 'autostart:claude', tabLabel: 'connect + autostart' },
        { key: 'codex', label: 'Codex CLI', tabKey: 'autostart:codex', tabLabel: 'connect + autostart' },
      ]);

      (input as any).handleData('\x1b[B');
      (input as any).handleData('\t');

      assert.equal(await selected, 'autostart:codex');
      const plain = stripAnsi(writes.join(''));
      assert.match(plain, /Tab connect \+ autostart/);
      assert.match(plain, /Codex CLI · connect \+ autostart/);
    } finally {
      input.destroy();
      process.stdin.pause();
      process.stdout.write = originalWrite;
      if (originalStdinTty) Object.defineProperty(process.stdin, 'isTTY', originalStdinTty);
      if (originalStdoutTty) Object.defineProperty(process.stdout, 'isTTY', originalStdoutTty);
      if (originalCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCi;
      }
    }
  });

  test('accepts choices after input was paused for an external prompt', async () => {
    const input = buildInput();
    const originalStdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const originalWrite = process.stdout.write;
    const originalCi = process.env.CI;

    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.CI;
    process.stdout.write = (() => true) as typeof process.stdout.write;

    try {
      input.pause();
      const selected = input.askChoice('Apply change?', [
        { key: 'yes', label: 'Allow' },
        { key: 'session', label: 'Allow all' },
        { key: 'no', label: 'Deny' },
      ]);

      (input as any).handleData('2');

      assert.equal(
        await Promise.race([
          selected,
          new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 20)),
        ]),
        'session',
      );
    } finally {
      input.destroy();
      process.stdin.pause();
      process.stdout.write = originalWrite;
      if (originalStdinTty) Object.defineProperty(process.stdin, 'isTTY', originalStdinTty);
      if (originalStdoutTty) Object.defineProperty(process.stdout, 'isTTY', originalStdoutTty);
      if (originalCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCi;
      }
    }
  });

  test('accepts y/n shortcuts when choice keys match', async () => {
    const input = buildInput();
    const originalStdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const originalWrite = process.stdout.write;
    const originalCi = process.env.CI;

    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.CI;
    process.stdout.write = (() => true) as typeof process.stdout.write;

    try {
      const selected = input.askChoice('Create plan?', [
        { key: 'y', label: 'yes' },
        { key: 'n', label: 'no' },
      ]);

      (input as any).handleData('n');

      assert.equal(await selected, 'n');
    } finally {
      input.destroy();
      process.stdin.pause();
      process.stdout.write = originalWrite;
      if (originalStdinTty) Object.defineProperty(process.stdin, 'isTTY', originalStdinTty);
      if (originalStdoutTty) Object.defineProperty(process.stdout, 'isTTY', originalStdoutTty);
      if (originalCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCi;
      }
    }
  });

  test('renders selected choice without an extra blank line after confirmation', async () => {
    const input = buildInput();
    const originalStdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const originalWrite = process.stdout.write;
    const originalCi = process.env.CI;
    const writes: string[] = [];

    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.CI;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const selected = input.askChoice('Create plan?', [
        { key: 'y', label: 'yes' },
        { key: 'n', label: 'no' },
      ]);

      (input as any).handleData('y');

      assert.equal(await selected, 'y');
      const confirmation = stripAnsi(writes.find((write) => write.includes('✓')) || '');
      assert.equal(confirmation, '\r\n  ✓ yes\r\n');
    } finally {
      input.destroy();
      process.stdin.pause();
      process.stdout.write = originalWrite;
      if (originalStdinTty) Object.defineProperty(process.stdin, 'isTTY', originalStdinTty);
      if (originalStdoutTty) Object.defineProperty(process.stdout, 'isTTY', originalStdoutTty);
      if (originalCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCi;
      }
    }
  });

  test('q resolves as cancellation instead of a selectable command', async () => {
    const input = buildInput();
    const originalStdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    const originalWrite = process.stdout.write;
    const originalCi = process.env.CI;

    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    delete process.env.CI;
    process.stdout.write = (() => true) as typeof process.stdout.write;

    try {
      const selected = input.askChoice('Apply change?', [
        { key: 'yes', label: 'Allow' },
        { key: 'session', label: 'Allow all' },
        { key: 'no', label: 'Deny' },
      ]);

      (input as any).handleData('q');

      assert.equal(await selected, '');
    } finally {
      input.destroy();
      process.stdin.pause();
      process.stdout.write = originalWrite;
      if (originalStdinTty) Object.defineProperty(process.stdin, 'isTTY', originalStdinTty);
      if (originalStdoutTty) Object.defineProperty(process.stdout, 'isTTY', originalStdoutTty);
      if (originalCi === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCi;
      }
    }
  });
});
