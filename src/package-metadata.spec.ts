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

  test('uses native SDK dependencies instead of LangChain or DeepAgents', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      assert.equal(dependency.startsWith('@langchain/'), false);
    }
    assert.equal(pkg.dependencies.langchain, undefined);
    assert.equal(pkg.dependencies.deepagents, undefined);
    assert.equal(typeof pkg.dependencies.openai, 'string');
    assert.equal(typeof pkg.dependencies['@anthropic-ai/sdk'], 'string');
    assert.equal(typeof pkg.dependencies['@google/generative-ai'], 'string');
    assert.equal(typeof pkg.dependencies['quickjs-emscripten'], 'string');
  });
});
