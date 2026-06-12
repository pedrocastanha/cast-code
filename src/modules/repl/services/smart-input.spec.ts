import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { stripAnsi } from '../../../ui/cast-design/cli-renderer';
import { LiveRegionCompositor } from '../../../ui/live-region/compositor';
import { SmartInput, type SmartInputOptions } from './smart-input';

const buildInput = (overrides: Partial<SmartInputOptions> = {}) => {
  const compositor = new LiveRegionCompositor({
    write: () => {},
    isTTY: false,
    columns: 80,
  });
  const input = new SmartInput({
    compositor,
    getCommandSuggestions: () => [],
    getMentionSuggestions: () => [],
    onSubmit: () => {},
    onCancel: () => {},
    onExit: () => {},
    ...overrides,
  });
  return { input, compositor };
};

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

describe('SmartInput buffer + suggestions', () => {
  test('typing characters fills the multiline buffer', () => {
    const { input } = buildInput();
    captureStdout(() => {
      (input as any).handleData('hello');
    });
    assert.equal((input as any).inputBox.buffer.text, 'hello');
  });

  test('shift-tab invokes the mode cycle handler without editing the buffer', () => {
    let cycles = 0;
    const { input } = buildInput({
      onCycleMode: () => {
        cycles += 1;
      },
    });

    captureStdout(() => {
      (input as any).handleData('\x1b[Z');
    });

    assert.equal(cycles, 1);
    assert.equal((input as any).inputBox.buffer.text, '');
  });

  test('shows dollar-reference suggestions and accepts the selected token', () => {
    const { input } = buildInput();
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

    assert.equal((input as any).inputBox.buffer.text, 'Use $frontend');
  });

  test('computes command suggestions from a slash prefix', () => {
    const { input } = buildInput({
      getCommandSuggestions: (value) =>
        value.startsWith('/he')
          ? [{ text: '/help', display: '/help', description: 'show help' }]
          : [],
    });

    captureStdout(() => {
      (input as any).handleData('/he');
    });

    assert.deepEqual(
      (input as any).suggestions.map((s: { text: string }) => s.text),
      ['/help'],
    );
  });

  test('backslash continuation inserts a newline instead of submitting', () => {
    let submitted: string | null = null;
    const { input } = buildInput({ onSubmit: (line) => { submitted = line; } });

    captureStdout(() => {
      (input as any).handleData('foo\\');
      (input as any).handleData('\r');
      (input as any).handleData('bar');
    });

    assert.equal(submitted, null);
    assert.equal((input as any).inputBox.buffer.text, 'foo\nbar');
  });

  test('enter submits and echoes the trimmed line into scrollback', () => {
    let submitted: string | null = null;
    const writes: string[] = [];
    const compositor = new LiveRegionCompositor({
      write: (s) => writes.push(s),
      isTTY: false,
      columns: 80,
    });
    const input = new SmartInput({
      compositor,
      getCommandSuggestions: () => [],
      getMentionSuggestions: () => [],
      onSubmit: (line) => { submitted = line; },
      onCancel: () => {},
      onExit: () => {},
    });

    captureStdout(() => {
      (input as any).handleData('hi there');
      (input as any).handleData('\r');
    });

    assert.equal(submitted, 'hi there');
    assert.equal((input as any).inputBox.buffer.text, '');
    assert.match(stripAnsi(writes.join('')), /› hi there/);
  });
});

describe('SmartInput choice menu', () => {
  test('arrow down and enter select the highlighted choice', async () => {
    const { input } = buildInput();
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
    const { input } = buildInput();
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
    const { input } = buildInput();
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
    const { input } = buildInput();
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
    const { input } = buildInput();
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
    const { input } = buildInput();
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
