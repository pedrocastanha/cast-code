import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SkillLoaderService } from './skill-loader.service';

describe('SkillLoaderService remote loading', () => {
  test('keeps legacy skill frontmatter valid when governance metadata is absent', async () => {
    const parser = {
      exists: async () => true,
      parseAll: async () =>
        new Map([
          [
            'general/search',
            {
              frontmatter: { name: 'search', description: 'Search', tools: ['grep'] },
              content: 'Use search.',
            },
          ],
        ]),
    };

    const loader = new SkillLoaderService(parser as any);
    await loader.loadSkills();
    const skill = loader.getSkill('search');

    assert.equal(skill?.name, 'search');
    assert.equal(skill?.description, 'Search');
    assert.deepEqual(skill?.tools, ['grep']);
    assert.deepEqual(skill?.tags, []);
    assert.deepEqual(skill?.scannerFindings, []);
    assert.equal(skill?.trust, undefined);
    assert.equal(skill?.risk, undefined);
    assert.equal(skill?.isActive, undefined);
  });

  test('parses governed skill metadata from frontmatter', async () => {
    const parser = {
      exists: async () => true,
      parseAll: async () =>
        new Map([
          [
            'community/campaign-strategy',
            {
              frontmatter: {
                name: 'campaign-strategy',
                description: 'Plan campaigns',
                tools: [],
                source: 'hermes-import',
                sourceRepo: 'nousresearch/hermes-agent',
                sourcePath: 'skills/campaign-strategy/SKILL.md',
                trust: 'community',
                risk: 'medium',
                tags: ['campaign', 'strategy'],
                environments: ['marketing'],
                scannerFindings: [
                  {
                    category: 'network_exfiltration',
                    severity: 'medium',
                    message: 'Mentions posting data externally.',
                  },
                ],
                isActive: false,
              },
              content: 'Use campaign strategy.',
            },
          ],
        ]),
    };

    const loader = new SkillLoaderService(parser as any);
    await loader.loadSkills();
    const skill = loader.getAllUnscopedSkills()[0];

    assert.equal(skill?.source, 'hermes-import');
    assert.equal(skill?.sourceRepo, 'nousresearch/hermes-agent');
    assert.equal(skill?.sourcePath, 'skills/campaign-strategy/SKILL.md');
    assert.equal(skill?.trust, 'community');
    assert.equal(skill?.risk, 'medium');
    assert.deepEqual(skill?.tags, ['campaign', 'strategy']);
    assert.deepEqual(skill?.environments, ['marketing']);
    assert.equal(skill?.scannerFindings?.[0]?.category, 'network_exfiltration');
    assert.equal(skill?.isActive, false);
  });

  test('keeps inactive governed skills out of runtime lookups while retaining them for governance scans', async () => {
    const parser = {
      exists: async () => true,
      parseAll: async () =>
        new Map([
          [
            'community/campaign-strategy',
            {
              frontmatter: {
                name: 'campaign-strategy',
                description: 'Plan campaigns',
                tools: [],
                source: 'hermes-import',
                risk: 'low',
                isActive: false,
              },
              content: 'Use campaign strategy.',
            },
          ],
        ]),
    };

    const loader = new SkillLoaderService(parser as any);
    await loader.loadSkills();

    assert.equal(loader.getSkill('campaign-strategy'), undefined);
    assert.deepEqual(loader.getAllSkills(), []);
    assert.equal(loader.getAllUnscopedSkills()[0]?.name, 'campaign-strategy');
  });

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

  test('preserves remote governed skill provenance when loading platform skills', () => {
    const parser = {
      exists: async () => false,
      parseAll: async () => new Map(),
    };

    const loader = new SkillLoaderService(parser as any);
    loader.loadRemoteSkills([
      {
        name: 'campaign-strategy',
        description: 'Campaign strategy',
        tools: [],
        guidelines: 'Plan campaigns.',
        source: 'hermes-import',
        sourceRepo: 'nousresearch/hermes-agent',
        sourcePath: 'skills/campaign-strategy/SKILL.md',
        trust: 'community',
        risk: 'high',
        tags: ['campaign'],
        environments: ['marketing'],
        scannerFindings: [
          {
            category: 'prompt_injection',
            severity: 'high',
            message: 'Attempts to bypass instructions.',
          },
        ],
        isActive: false,
      },
    ]);

    const skill = loader.getAllUnscopedSkills()[0];
    assert.equal(skill?.source, 'hermes-import');
    assert.equal(skill?.sourceRepo, 'nousresearch/hermes-agent');
    assert.equal(skill?.sourcePath, 'skills/campaign-strategy/SKILL.md');
    assert.equal(skill?.trust, 'community');
    assert.equal(skill?.risk, 'high');
    assert.deepEqual(skill?.tags, ['campaign']);
    assert.deepEqual(skill?.environments, ['marketing']);
    assert.equal(skill?.scannerFindings?.[0]?.category, 'prompt_injection');
    assert.equal(skill?.isActive, false);
    assert.equal(loader.getSkill('campaign-strategy'), undefined);
  });
});
