import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnitTestGeneratorService } from './unit-test-generator.service';
import type { MultiLlmService } from '../../../common/services/multi-llm.service';

const stubLlm = {} as MultiLlmService;

// Ensures the constructor retains the provided multi-LLM service reference for dependency injection.
test('constructor stores the provided LLM dependency', () => {
  const service = new UnitTestGeneratorService(stubLlm);
  assert.strictEqual(service['multiLlmService'], stubLlm);
});

// Validates that filterRelevantFiles excludes test artifacts and non-source files while keeping production sources.
test('filterRelevantFiles excludes tests and outputs only source files', () => {
  const service = new UnitTestGeneratorService(stubLlm);
  const files = [
    'src/app/main.ts',
    'src/app/main.spec.ts',
    'lib/utils.js',
    'tests/test_helper.ts',
    'dist/bundle.js',
    'node_modules/dep/index.ts',
    'scripts/build.ts',
    'src/utils/helper.jsx',
    'src/utils/helper.test.jsx',
    'server/module.py',
    'server/module_test.py',
    'src/test/support.ts',
  ];
  const relevant = service['filterRelevantFiles'](files);
  assert.deepStrictEqual(relevant, ['src/app/main.ts', 'lib/utils.js', 'scripts/build.ts', 'src/utils/helper.jsx', 'server/module.py']);
});

// Verifies resolveTestPath normalizes extensions for JavaScript, Python, and Java sources to their expected test locations.
test('resolveTestPath returns expected test paths for supported languages', () => {
  const service = new UnitTestGeneratorService(stubLlm);
  const jsPath = service['resolveTestPath']('src/modules/git/service.ts', 'javascript');
  const jsxPath = service['resolveTestPath']('src/components/Widget.jsx', 'javascript');
  const pythonPath = service['resolveTestPath']('src/helpers/transform.py', 'python');
  const javaMainPath = service['resolveTestPath']('src/main/java/com/example/App.java', 'java');
  const javaPlainPath = service['resolveTestPath']('lib/Legacy.java', 'java');

  assert.strictEqual(jsPath, 'src/modules/git/service.spec.ts');
  assert.strictEqual(jsxPath, 'src/components/Widget.spec.ts');
  assert.strictEqual(pythonPath, 'tests/test_transform.py');
  assert.strictEqual(javaMainPath, 'src/test/java/com/example/AppTest.java');
  assert.strictEqual(javaPlainPath, 'lib/LegacyTest.java');
});

// Confirms getFileDiff returns an empty string when no git diff fragments exist.
test('getFileDiff returns empty string when git output is empty', () => {
  const service = new UnitTestGeneratorService(stubLlm);
  service['execGit'] = () => '';
  const diff = service['getFileDiff']('main', 'src/index.ts');
  assert.strictEqual(diff, '');
});

// Confirms getFileDiff truncates overly long diffs and appends a truncation notice.
test('getFileDiff truncates long git diffs and adds a notice', () => {
  const service = new UnitTestGeneratorService(stubLlm);
  const huge = 'x'.repeat(9000);
  service['execGit'] = (command: string) => (command.includes('--cached') ? '' : huge);
  const diff = service['getFileDiff']('main', 'src/index.ts', 8000);
  assert.strictEqual(diff, 'x'.repeat(8000) + '\n... (diff truncated)');
});

// Ensures detectTestFramework picks the highest-priority framework listed in package metadata.
test('detectTestFramework prefers vitest before other frameworks', () => {
  const service = new UnitTestGeneratorService(stubLlm);
  const tempDir = mkdtempSync(join(tmpdir(), 'pkg-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(tempDir);
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { mocha: '1.0.0' }, devDependencies: { vitest: '1.0.0', jest: '1.0.0' } }),
    );
    assert.strictEqual(service.detectTestFramework(), 'vitest');
  } finally {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// Ensures detectTestFramework falls back to the node:test default when package metadata cannot be read.
test('detectTestFramework falls back to node:test if package.json is missing', () => {
  const service = new UnitTestGeneratorService(stubLlm);
  const tempDir = mkdtempSync(join(tmpdir(), 'pkg-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(tempDir);
    assert.strictEqual(service.detectTestFramework(), 'node:test');
  } finally {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});
