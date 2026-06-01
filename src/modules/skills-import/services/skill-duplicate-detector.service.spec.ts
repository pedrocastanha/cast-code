import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SkillDuplicateDetectorService } from './skill-duplicate-detector.service';

describe('SkillDuplicateDetectorService', () => {
  test('detects duplicate names and duplicate content fingerprints', () => {
    const service = new SkillDuplicateDetectorService();
    const existing = [
      { name: 'campaign-strategy', description: 'Plan launch campaigns', guidelines: 'Create campaign briefs.' },
      { name: 'other-name', description: 'Review SQL', guidelines: 'Analyze query data.' },
    ];

    assert.equal(service.detect({
      name: 'campaign-strategy',
      description: 'Different',
      body: 'Different body',
    }, existing as any).status, 'duplicateName');

    assert.equal(service.detect({
      name: 'campaign-copy',
      description: 'Plan launch campaigns',
      body: 'Create campaign briefs.',
    }, existing as any).status, 'duplicateContent');
  });

  test('detects similar content without exact duplication', () => {
    const service = new SkillDuplicateDetectorService();
    const result = service.detect({
      name: 'campaign-planner',
      description: 'Plan launch campaign strategy and campaign briefs',
      body: 'Create launch campaign briefs and define channel strategy.',
    }, [
      {
        name: 'marketing-campaign',
        description: 'Build launch campaign strategy',
        guidelines: 'Create campaign briefs and define channel plans.',
      },
    ] as any);

    assert.equal(result.status, 'similar');
    assert.equal(result.matches[0].name, 'marketing-campaign');
  });
});
