import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EFFORT_PROFILES,
  EffortLevel,
  getEffortProfile,
  normalizeEffortLevel,
} from './config.types';

describe('effort profiles', () => {
  test('normalizeEffortLevel accepts known aliases and rejects unknown values', () => {
    assert.equal(normalizeEffortLevel('fast'), 'fast');
    assert.equal(normalizeEffortLevel('BALANCED'), 'balanced');
    assert.equal(normalizeEffortLevel('deep'), 'deep');
    assert.equal(normalizeEffortLevel('max'), 'max');
    assert.equal(normalizeEffortLevel('expensive'), undefined);
  });

  test('profiles define increasing quality budgets without exposing secrets', () => {
    const levels: EffortLevel[] = ['fast', 'balanced', 'deep', 'max'];

    for (const level of levels) {
      const profile = getEffortProfile(level);
      assert.equal(profile.level, level);
      assert(profile.label.length > 0);
      assert(profile.description.length > 0);
      assert(profile.maxToolCalls > 0);
      assert(profile.maxOutputTokens > 0);
      assert(!JSON.stringify(profile).includes('apiKey'));
    }

    assert(EFFORT_PROFILES.fast.maxToolCalls < EFFORT_PROFILES.balanced.maxToolCalls);
    assert(EFFORT_PROFILES.balanced.maxToolCalls < EFFORT_PROFILES.deep.maxToolCalls);
    assert(EFFORT_PROFILES.deep.maxToolCalls <= EFFORT_PROFILES.max.maxToolCalls);
    assert(EFFORT_PROFILES.fast.maxOutputTokens < EFFORT_PROFILES.max.maxOutputTokens);
  });
});
