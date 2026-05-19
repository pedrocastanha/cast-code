import assert from 'node:assert/strict';
import matter from 'gray-matter';
import { describe, test } from 'node:test';

import { SkillConverterService } from './skill-converter.service';

const legacySkillBrandLower = ['her', 'mes'].join('');
const legacySkillBrandTitle = `${legacySkillBrandLower[0].toUpperCase()}${legacySkillBrandLower.slice(1)}`;
const legacySkillBrandPattern = new RegExp(legacySkillBrandLower, 'i');

describe('SkillConverterService', () => {
  test('converts imported skills to inactive governed Cast markdown without provenance branding', () => {
    const service = new SkillConverterService();
    const markdown = service.convertToMarkdown({
      skill: {
        name: 'campaign-strategy',
        description: 'Build campaign plans',
        sourcePath: 'skills/campaign-strategy/SKILL.md',
        body: `# Campaign Strategy\n\nPlan the campaign with ${legacySkillBrandTitle} Agent notes.`,
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
    assert.equal(parsed.data.source, undefined);
    assert.equal(parsed.data.sourceRepo, undefined);
    assert.equal(parsed.data.sourcePath, undefined);
    assert.equal(parsed.data.trust, 'community');
    assert.equal(parsed.data.risk, 'medium');
    assert.deepEqual(parsed.data.environments, ['marketing']);
    assert.deepEqual(parsed.data.tags, ['campaign', 'strategy']);
    assert.equal(parsed.data.isActive, false);
    assert.equal(parsed.data.scannerFindings[0].category, 'network_exfiltration');
    assert.doesNotMatch(parsed.content, legacySkillBrandPattern);
    assert.match(parsed.content, /Plan the campaign/);
  });
});
