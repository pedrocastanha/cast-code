import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FilesystemToolsService } from './filesystem-tools.service';

describe('FilesystemToolsService read_file', () => {
  test('does not classify small text files as binary', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cast-fs-small-text-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src', 'price.js'),
      'export function finalPrice(amount, discountRate) {\n  return amount - amount * discountRate;\n}\n',
    );

    try {
      const service = new FilesystemToolsService();
      service.setRootDir(root);
      const readFile = service.getTools().find((tool) => tool.name === 'read_file');
      assert(readFile);

      const output = String(await readFile.invoke({ file_path: 'src/price.js' }));

      assert.match(output, /export function finalPrice/);
      assert.doesNotMatch(output, /binary file/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('still reports real null-byte files as binary', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cast-fs-binary-'));
    writeFileSync(join(root, 'payload.bin'), Buffer.from([0x41, 0x00, 0x42]));

    try {
      const service = new FilesystemToolsService();
      service.setRootDir(root);
      const readFile = service.getTools().find((tool) => tool.name === 'read_file');
      assert(readFile);

      const output = String(await readFile.invoke({ file_path: 'payload.bin' }));

      assert.match(output, /binary file/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
