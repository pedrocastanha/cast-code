import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ShellToolsService } from './shell-tools.service';

describe('ShellToolsService root guard', () => {
  test('rejects foreground commands with cwd outside the configured project root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cast-shell-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'cast-shell-outside-'));

    try {
      const service = new ShellToolsService({
        checkPermission: async () => true,
      } as any);
      service.setRootDir(root);
      const shell = service.getTools().find((tool) => tool.name === 'shell');
      assert(shell);

      const output = String(await shell.invoke({
        command: 'pwd',
        cwd: outside,
      }));

      assert.match(output, /outside the project root/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('rejects background commands with cwd outside the configured project root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cast-shell-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'cast-shell-outside-'));

    try {
      const service = new ShellToolsService({
        checkPermission: async () => true,
      } as any);
      service.setRootDir(root);
      const shellBackground = service.getTools().find((tool) => tool.name === 'shell_background');
      assert(shellBackground);

      const output = String(await shellBackground.invoke({
        command: 'pwd',
        cwd: outside,
      }));

      assert.match(output, /outside the project root/i);
      assert.doesNotMatch(output, /processId/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
