import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import { SkillPackageDiscoveryService } from './skill-package-discovery.service';

describe('SkillPackageDiscoveryService', () => {
  test('discovers SKILL.md files with frontmatter, body, and support files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cast-skill-fixture-'));
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

      const service = new SkillPackageDiscoveryService();
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

  test('can dry-discover a real skill repository when configured', async (t) => {
    const sourcePath = process.env.CAST_SKILLS_REPO_PATH;
    if (!sourcePath || !existsSync(sourcePath)) {
      t.skip('CAST_SKILLS_REPO_PATH is not configured');
      return;
    }

    const service = new SkillPackageDiscoveryService();
    const skills = await service.discover(sourcePath);

    assert.ok(skills.length > 0);
    assert.ok(skills.every((skill) => skill.sourcePath.endsWith('SKILL.md')));
  });
});
