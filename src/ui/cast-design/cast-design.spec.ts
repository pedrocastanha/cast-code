import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CAST_COLORS, CAST_COMMANDS, getCastCssVariables, getCastBaseCss, padVisible, stripAnsi, visibleWidth, wrapRow } from './index';

describe('cast design system', () => {
  test('exposes the approved cyberpunk token palette', () => {
    assert.equal(CAST_COLORS.bgDeep, '#040b16');
    assert.equal(CAST_COLORS.bgBase, '#0a1628');
    assert.equal(CAST_COLORS.accentMid, '#38bdf8');
    assert.equal(CAST_COLORS.accentBright, '#7dd3fc');
    assert.equal(CAST_COLORS.green, '#34d399');
    assert.equal(CAST_COLORS.purple, '#818cf8');
  });

  test('renders shared CSS variables for the web shell', () => {
    const css = `${getCastCssVariables()}\n${getCastBaseCss()}`;

    assert.match(css, /--bg-deep:\s*#040b16/i);
    assert.match(css, /--accent-mid:\s*#38bdf8/i);
    assert.match(css, /--sidebar-width:\s*280px/i);
    assert.match(css, /--font-mono:/i);
  });

  test('pads visible width correctly when ANSI codes are present', () => {
    const input = '\x1b[38;5;45mcast\x1b[0m';
    const padded = padVisible(input, 8);

    assert.equal(visibleWidth(input), 4);
    assert.equal(visibleWidth(padded), 8);
    assert.equal(stripAnsi(padded), 'cast    ');
  });

  test('wraps content in a bordered CLI row using visible width', () => {
    const row = wrapRow('\x1b[38;5;45mhello\x1b[0m', 12, '\x1b[38;5;24m');
    const plain = stripAnsi(row);

    assert.equal(plain.length, 16);
    assert.match(plain, /^│ hello\s+ │$/);
  });

  test('quick command catalog points to the implemented agents command', () => {
    const commandKeys: string[] = CAST_COMMANDS.map((command) => command.key);

    assert(commandKeys.includes('/agents'));
    assert(!commandKeys.includes('/agent'));
  });
});
