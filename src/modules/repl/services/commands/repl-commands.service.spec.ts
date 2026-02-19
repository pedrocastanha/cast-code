import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { ReplCommandsService } from './repl-commands.service';

const createService = () =>
  new ReplCommandsService(
    { clearHistory: () => {}, getMessageCount: () => 0, getTokenCount: () => 0 } as any,
    { getProvider: () => 'test-provider', getModel: () => 'test-model' } as any,
    { getServerSummaries: () => [] } as any,
    { getAllAgents: () => [] } as any,
    { getAllSkills: () => [] } as any,
    { hasContext: () => false } as any,
    {} as any,
  );

describe('ReplCommandsService printHelp', () => {
  let service: ReplCommandsService;
  let capturedWrites: string[] = [];
  let originalStdoutWrite: typeof process.stdout.write;

  beforeEach(() => {
    capturedWrites = [];
    originalStdoutWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Buffer) => {
      capturedWrites.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    service = createService();
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  // Ensures the /unit-test entry appears exactly once with its description in the help output.
  test('/unit-test command is listed with full description', () => {
    service.printHelp();
    const combined = capturedWrites.join('');
    assert.ok(combined.includes('/unit-test'), 'Help output should mention the /unit-test command');
    assert.ok(
      combined.includes('Generate unit tests for branch changes'),
      'Help output should describe what /unit-test does',
    );
    const occurrences = (combined.match(/\/unit-test/g) ?? []).length;
    assert.strictEqual(occurrences, 1, 'The /unit-test entry should only appear once');
  });

  // Confirms the /unit-test command remains ordered between /pr and /review commands in the commands section.
  test('/unit-test is positioned between /pr and /review entries', () => {
    service.printHelp();
    const combined = capturedWrites.join('');
    const prIndex = combined.indexOf('/pr');
    const unitTestIndex = combined.indexOf('/unit-test');
    const reviewIndex = combined.indexOf('/review');
    assert.ok(prIndex >= 0, 'Help output must contain /pr entry');
    assert.ok(unitTestIndex >= 0, 'Help output must contain /unit-test entry');
    assert.ok(reviewIndex >= 0, 'Help output must contain /review entry');
    assert.ok(prIndex < unitTestIndex, '/unit-test should appear after /pr');
    assert.ok(unitTestIndex < reviewIndex, '/unit-test should appear before /review');
  });
});
