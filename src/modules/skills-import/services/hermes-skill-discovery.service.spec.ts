import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import { HermesSkillDiscoveryService } from './hermes-skill-discovery.service';

describe('HermesSkillDiscoveryService', () => {
  test('discovers SKILL.md files with frontmatter, body, and support files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cast-hermes-fixture-'));
    try {
      await mkdir(path.join(root, 'skills', 'campaign-strategy', 'references'), { recursive: true });
      await writeFile(
        path.join(root, 'skills', 'campaign-strategy', 'SKILL.md'),
        [
          '---',
          'name: campaign-strategy',
          'description: Build campaign briefs',
          '---',
          '',
          '# Campaign Strategy',
          '',
          'Use this for campaign planning.',
          '',
        ].join('\n'),
      );
      await writeFile(path.join(root, 'skills', 'campaign-strategy', 'references', 'brief.md'), '# Brief');

      const service = new HermesSkillDiscoveryService();
      const skills = await service.discover(root);

      assert.equal(skills.length, 1);
      assert.equal(skills[0].name, 'campaign-strategy');
      assert.equal(skills[0].description, 'Build campaign briefs');
      assert.equal(skills[0].sourcePath, 'skills/campaign-strategy/SKILL.md');
      assert.match(skills[0].body, /Campaign Strategy/);
      assert.deepEqual(skills[0].supportFiles, ['skills/campaign-strategy/references/brief.md']);
      assert.equal(skills[0].frontmatter.name, 'campaign-strategy');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('can dry-discover the real Hermes checkout when it exists', async (t) => {
    if (!existsSync('/tmp/hermes-agent')) {
      t.skip('/tmp/hermes-agent is not present');
      return;
    }

    const service = new HermesSkillDiscoveryService();
    const skills = await service.discover('/tmp/hermes-agent');

    assert.ok(skills.length > 0);
    assert.ok(skills.every((skill) => skill.sourcePath.endsWith('SKILL.md')));
  });
});
