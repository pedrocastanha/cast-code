import assert from 'node:assert/strict';
import matter from 'gray-matter';
import { describe, test } from 'node:test';

import { SkillConverterService } from './skill-converter.service';

describe('SkillConverterService', () => {
  test('converts Hermes skills to inactive governed Cast markdown', () => {
    const service = new SkillConverterService();
    const markdown = service.convertToMarkdown({
      skill: {
        name: 'campaign-strategy',
        description: 'Build campaign plans',
        sourcePath: 'skills/campaign-strategy/SKILL.md',
        body: '# Campaign Strategy\n\nPlan the campaign.',
        supportFiles: ['skills/campaign-strategy/references/brief.md'],
        frontmatter: { name: 'campaign-strategy' },
      },
      scan: {
        risk: 'medium',
        findings: [
          {
            category: 'network_exfiltration',
            severity: 'medium',
            message: 'Mentions external post.',
          },
        ],
      },
      environments: ['marketing'],
      tags: ['campaign', 'strategy'],
    });

    const parsed = matter(markdown);
    assert.equal(parsed.data.name, 'campaign-strategy');
    assert.equal(parsed.data.source, 'hermes-import');
    assert.equal(parsed.data.sourceRepo, 'nousresearch/hermes-agent');
    assert.equal(parsed.data.sourcePath, 'skills/campaign-strategy/SKILL.md');
    assert.equal(parsed.data.trust, 'community');
    assert.equal(parsed.data.risk, 'medium');
    assert.deepEqual(parsed.data.environments, ['marketing']);
    assert.deepEqual(parsed.data.tags, ['campaign', 'strategy']);
    assert.equal(parsed.data.isActive, false);
    assert.equal(parsed.data.scannerFindings[0].category, 'network_exfiltration');
    assert.match(parsed.content, /Imported from Hermes/);
    assert.match(parsed.content, /Plan the campaign/);
  });
});
