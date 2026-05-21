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

  test('uses the LangChain Deep Agents and QuickJS versions validated for native streaming', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

    assert.equal(pkg.dependencies.deepagents, '1.9.0');
    assert.equal(pkg.dependencies['@langchain/quickjs'], '0.4.0');
  });
});
