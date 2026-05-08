import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
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
      /› aaaaaaaa\r\naa\x1b\[J\r\nfooter/,
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
