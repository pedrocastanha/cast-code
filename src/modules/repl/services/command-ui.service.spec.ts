import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CommandUiService } from './command-ui.service';
import { stripAnsi, visibleWidth } from '../../../ui/cast-design/cli-renderer';

describe('CommandUiService', () => {
  test('renders a command panel with title, sections, rows, and footer', () => {
    const ui = new CommandUiService();
    const output = ui.panel({
      title: 'Effort',
      subtitle: 'Runtime budget',
      sections: [
        {
          title: 'Current',
          rows: [
            { label: 'Mode', value: 'balanced', hint: 'default' },
            { label: 'Model', value: 'openai/gpt-4.1-mini' },
          ],
        },
      ],
      footer: 'Use /effort to change.',
      width: 72,
    });

    const plain = stripAnsi(output);
    assert.match(plain, /Effort/);
    assert.match(plain, /Runtime budget/);
    assert.match(plain, /Mode/);
    assert.match(plain, /balanced/);
    assert.match(plain, /Use \/effort to change/);

    for (const line of output.split('\n')) {
      assert(visibleWidth(line) <= 76, `line is too wide: ${stripAnsi(line)}`);
    }
  });

  test('renders status lines consistently', () => {
    const ui = new CommandUiService();

    assert.match(stripAnsi(ui.success('Saved')), /Saved/);
    assert.match(stripAnsi(ui.warning('Careful')), /Careful/);
    assert.match(stripAnsi(ui.error('Failed')), /Failed/);
  });

  test('keeps command panels within narrow terminal width', () => {
    const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 32 });
    const ui = new CommandUiService();

    try {
      const output = ui.panel({
        title: 'Agents',
        subtitle: '7 loaded',
        sections: [
          {
            lines: [
              'frontend  Frontend specialist for UI/UX implementation [read_file, write_file, edit_file]',
            ],
          },
        ],
        footer: '/agents <name> shows details.',
      });

      for (const line of output.split(/\r?\n/).filter(Boolean)) {
        assert(
          visibleWidth(line) <= 32,
          `line should fit 32 columns: ${stripAnsi(line)}`,
        );
      }
    } finally {
      if (originalColumns) {
        Object.defineProperty(process.stdout, 'columns', originalColumns);
      }
    }
  });
});
