import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SwarmSuggestionService } from './swarm-suggestion.service';

describe('SwarmSuggestionService', () => {
  const service = new SwarmSuggestionService();

  test('suggests swarm for explicit requests', () => {
    const result = service.evaluate('Use agent swarm to implement billing limits');
    assert.equal(result.shouldSuggest, true);
    assert.equal(result.confidence, 'high');
  });

  test('skips small edits', () => {
    const result = service.evaluate('fix typo in README');
    assert.equal(result.shouldSuggest, false);
  });

  test('suggests for parallel multi-surface work', () => {
    const result = service.evaluate(
      'Implement billing usage limits across backend API, web dashboard, and CLI integration tests with full refactor',
    );
    assert.equal(result.shouldSuggest, true);
  });
});
