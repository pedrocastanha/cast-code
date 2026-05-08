import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

  test('rejects absolute read paths outside the configured project root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cast-fs-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'cast-fs-outside-'));
    const outsideFile = join(outside, 'secret.txt');
    writeFileSync(outsideFile, 'do not read me');

    try {
      const service = new FilesystemToolsService();
      service.setRootDir(root);
      const readFile = service.getTools().find((tool) => tool.name === 'read_file');
      assert(readFile);

      const output = String(await readFile.invoke({ file_path: outsideFile }));

      assert.match(output, /outside the project root/i);
      assert.doesNotMatch(output, /do not read me/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test('rejects writes outside the configured project root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cast-fs-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'cast-fs-outside-'));
    const outsideFile = join(outside, 'created.txt');

    try {
      const service = new FilesystemToolsService();
      service.setRootDir(root);
      const writeFile = service.getTools().find((tool) => tool.name === 'write_file');
      assert(writeFile);

      const output = String(await writeFile.invoke({
        file_path: outsideFile,
        content: 'do not write me',
      }));

      assert.match(output, /outside the project root/i);
      assert.equal(existsSync(outsideFile), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
