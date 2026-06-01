import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { copyTextToClipboard, getClipboardCommands } from './pr-generator.service';

describe('PR clipboard helpers', () => {
  test('prefers Wayland clipboard command before X11 fallbacks on Linux', () => {
    const commands = getClipboardCommands('linux', { WAYLAND_DISPLAY: 'wayland-0' });

    assert.equal(commands[0].command, 'wl-copy');
    assert.deepEqual(
      commands.map((command) => command.command),
      ['wl-copy', 'xclip', 'xsel', 'clip.exe'],
    );
  });

  test('copies through the first available Linux clipboard backend', () => {
    const tried: string[] = [];
    const copied = copyTextToClipboard('PR body', {
      platform: 'linux',
      env: { WAYLAND_DISPLAY: 'wayland-0' },
      run: (command, _args, input) => {
        tried.push(`${command}:${input}`);
        return { status: command === 'wl-copy' ? 0 : 1 };
      },
    });

    assert.equal(copied, true);
    assert.deepEqual(tried, ['wl-copy:PR body']);
  });

  test('falls back to WSL Windows clipboard when Linux clipboard tools are unavailable', () => {
    const tried: string[] = [];
    const copied = copyTextToClipboard('PR body', {
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      run: (command) => {
        tried.push(command);
        return { status: command === 'clip.exe' ? 0 : 1 };
      },
    });

    assert.equal(copied, true);
    assert.deepEqual(tried, ['xclip', 'xsel', 'clip.exe']);
  });
});
