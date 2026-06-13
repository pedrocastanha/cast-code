import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HeadlessSmartInput } from './headless-smart-input';

describe('HeadlessSmartInput', () => {
  test('autoYes askChoice picks the y choice when present', async () => {
    const input = new HeadlessSmartInput({ autoYes: true });
    const answer = await input.askChoice('Confirm and push?', [
      { key: 'y', label: 'yes' },
      { key: 'n', label: 'no' },
      { key: 'e', label: 'edit' },
    ]);
    assert.equal(answer, 'y');
  });

  test('autoYes askChoice falls back to the first choice when no y exists', async () => {
    const input = new HeadlessSmartInput({ autoYes: true });
    const answer = await input.askChoice('Pick', [
      { key: 'a', label: 'alpha' },
      { key: 'b', label: 'beta' },
    ]);
    assert.equal(answer, 'a');
  });

  test('interactive askChoice resolves the numbered selection via injected ask', async () => {
    const prompts: string[] = [];
    const input = new HeadlessSmartInput({
      autoYes: false,
      ask: async (q) => { prompts.push(q); return '2'; },
    });
    const answer = await input.askChoice('Pick', [
      { key: 'y', label: 'yes' },
      { key: 'n', label: 'no' },
    ]);
    assert.equal(answer, 'n');
    assert.ok(prompts.length >= 1);
  });

  test('interactive askChoice re-asks on invalid input then accepts a key shortcut', async () => {
    const answers = ['zzz', 'y'];
    const input = new HeadlessSmartInput({ autoYes: false, ask: async () => answers.shift()! });
    const answer = await input.askChoice('Pick', [
      { key: 'y', label: 'yes' },
      { key: 'n', label: 'no' },
    ]);
    assert.equal(answer, 'y');
  });

  test('question delegates to ask', async () => {
    const input = new HeadlessSmartInput({ autoYes: false, ask: async () => 'hello' });
    assert.equal(await input.question('Message:'), 'hello');
  });

  test('autoYes question returns empty string without prompting', async () => {
    const input = new HeadlessSmartInput({ autoYes: true, ask: async () => { throw new Error('must not prompt'); } });
    assert.equal(await input.question('Message:'), '');
  });

  test('lifecycle and rendering methods are safe no-ops', () => {
    const input = new HeadlessSmartInput({ autoYes: true });
    input.start(); input.pause(); input.resume(); input.refresh();
    input.showPrompt(); input.enterPassiveMode(); input.exitPassiveMode();
    input.setFooterStatus({ mode: '', model: '', hints: [] });
    input.rewriteLinesAbove(0, '');
    input.destroy();
  });
});
