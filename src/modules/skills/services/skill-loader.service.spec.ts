import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SkillLoaderService } from './skill-loader.service';

describe('SkillLoaderService remote loading', () => {
  test('loads remote skills and lets local project skills override them', async () => {
    const parser = {
      exists: async () => true,
      parseAll: async () =>
        new Map([
          [
            'code-review',
            {
              frontmatter: { name: 'code-review', description: 'local', tools: ['grep'] },
              content: 'local guidelines',
            },
          ],
        ]),
    };

    const loader = new SkillLoaderService(parser as any);
    const overridden = loader.loadRemoteSkills([
      {
        name: 'code-review',
        description: 'remote',
        tools: ['read_file'],
        guidelines: 'remote guidelines',
        source: 'remote',
      },
    ]);

    await loader.loadFromPath('/project/.cast/skills');
    const skill = loader.getSkill('code-review');

    assert.deepEqual(overridden, []);
    assert.equal(skill?.description, 'local');
    assert.equal(skill?.guidelines, 'local guidelines');
    assert.deepEqual(skill?.tools, ['grep']);
    assert.equal(skill?.source, 'local');
  });

  test('reports remote names that override existing definitions', () => {
    const parser = {
      exists: async () => false,
      parseAll: async () => new Map(),
    };

    const loader = new SkillLoaderService(parser as any);
    loader.loadRemoteSkills([
      { name: 'search', description: 'first', tools: [], guidelines: 'first', source: 'remote' },
    ]);
    const overridden = loader.loadRemoteSkills([
      { name: 'search', description: 'second', tools: [], guidelines: 'second', source: 'remote' },
    ]);

    assert.deepEqual(overridden, ['search']);
    assert.equal(loader.getSkill('search')?.guidelines, 'second');
  });
});
