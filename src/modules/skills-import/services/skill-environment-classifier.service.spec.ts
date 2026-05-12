import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SkillEnvironmentClassifierService } from './skill-environment-classifier.service';

describe('SkillEnvironmentClassifierService', () => {
  test('classifies skills into plan environments by name, description, and body', () => {
    const service = new SkillEnvironmentClassifierService();

    assert.deepEqual(service.classify({
      name: 'campaign-copy',
      description: 'SEO ad launch',
      body: 'Create landing page content.',
    }), ['marketing']);
    assert.deepEqual(service.classify({
      name: 'visual-qa',
      description: 'Figma accessibility review',
      body: 'Audit UI design.',
    }), ['design']);
    assert.deepEqual(service.classify({
      name: 'debug-tests',
      description: 'Git refactor review',
      body: 'Write tests.',
    }), ['engineering']);
    assert.deepEqual(service.classify({
      name: 'sql-analysis',
      description: 'Chart data quality',
      body: 'Analyze query output.',
    }), ['data']);
    assert.deepEqual(service.classify({
      name: 'support-ticket',
      description: 'Customer escalation',
      body: 'Handle tickets.',
    }), ['support']);
  });
});
