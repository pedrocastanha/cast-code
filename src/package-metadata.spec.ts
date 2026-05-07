import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

describe('package metadata', () => {
  test('runtime dependencies are pinned to tested versions instead of latest', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    const latestDeps = Object.entries(pkg.dependencies)
      .filter(([, version]) => version === 'latest')
      .map(([name]) => name);

    assert.deepEqual(latestDeps, []);
  });
});
