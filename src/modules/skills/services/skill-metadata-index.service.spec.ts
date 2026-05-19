import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { SkillMetadataIndexService } from './skill-metadata-index.service';

describe('SkillMetadataIndexService', () => {
  let root: string;
  let service: SkillMetadataIndexService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cast-skill-index-'));
    service = new SkillMetadataIndexService();
  });

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('loads entries and resolves aliases and source paths', async () => {
    const filePath = path.join(root, 'skill-metadata.cast-skill-index.yaml');
    await writeFile(filePath, [
      'version: 1',
      'skills:',
      '  ideation:',
      '    sourcePath: skills/creative/creative-ideation/SKILL.md',
      '    aliases:',
      '      - creative-ideation',
      '    category: creative',
      '    environments:',
      '      - marketing',
      '    profiles:',
      '      - marketing:campaign',
      '    risk: low',
      '    trust: community',
    ].join('\n'), 'utf-8');

    const index = await service.loadFromFile(filePath, {
      knownSkillNames: ['ideation'],
      knownSourcePaths: ['skills/creative/creative-ideation/SKILL.md'],
      validEnvironments: ['marketing'],
    });

    assert.equal(index.findForSkill('ideation')?.category, 'creative');
    assert.equal(index.findForSkill('creative-ideation')?.name, 'ideation');
    assert.equal(index.findForSourcePath('skills/creative/creative-ideation/SKILL.md')?.name, 'ideation');
  });

  test('validates duplicate aliases, unknown skills, unknown environments, and unsafe activation', async () => {
    const filePath = path.join(root, 'bad-index.yaml');
    await writeFile(filePath, [
      'version: 1',
      'skills:',
      '  missing-skill:',
      '    sourcePath: skills/missing/SKILL.md',
      '    aliases: [same-alias]',
      '    environments: [unknown-env]',
      '    risk: critical',
      '    trust: quarantined',
      '    isActive: true',
      '  other:',
      '    sourcePath: skills/other/SKILL.md',
      '    aliases: [same-alias]',
      '    environments: [marketing]',
      '    risk: low',
      '    trust: community',
    ].join('\n'), 'utf-8');

    await assert.rejects(
      () => service.loadFromFile(filePath, {
        knownSkillNames: ['other'],
        knownSourcePaths: ['skills/other/SKILL.md'],
        validEnvironments: ['marketing'],
      }),
      /missing-skill|same-alias|unknown-env|critical/i,
    );
  });
});
