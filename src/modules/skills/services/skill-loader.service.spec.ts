import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { SkillLoaderService } from './skill-loader.service';
import { SkillMetadataIndexService } from './skill-metadata-index.service';

const legacySkillBrandLower = ['her', 'mes'].join('');
const legacySkillBrandTitle = `${legacySkillBrandLower[0].toUpperCase()}${legacySkillBrandLower.slice(1)}`;
const legacySkillAgentTitle = `${legacySkillBrandTitle} Agent`;
const legacySkillAgentSlug = `${legacySkillBrandLower}-agent`;
const legacySkillBrandPattern = new RegExp(legacySkillBrandLower, 'i');

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
                source: 'local',
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

    assert.equal(skill?.source, 'local');
    assert.equal(skill?.sourceRepo, undefined);
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
                source: 'local',
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

  test('loads bundled SKILL.md packages without indexing support markdown as skills', async () => {
    const parser = {
      exists: async () => true,
      parseAll: async () =>
        new Map([
          [
            'catalog/skills/software-development/test-driven-development/SKILL',
            {
              frontmatter: {
                name: 'test-driven-development',
                description: 'TDD workflow',
                metadata: { cast: { tags: ['testing', 'development'] } },
              },
              content: 'Write the failing test first.',
            },
          ],
          [
            'catalog/skills/software-development/test-driven-development/references/example',
            {
              frontmatter: {},
              content: 'Support file, not a standalone skill.',
            },
          ],
        ]),
    };

    const loader = new SkillLoaderService(parser as any);
    await loader.loadSkills();

    assert.equal(loader.getAllSkills().length, 1);
    const skill = loader.getSkill('test-driven-development');
    assert.equal(skill?.source, 'builtin');
    assert.equal(skill?.sourceRepo, undefined);
    assert.equal(skill?.sourcePath, 'skills/software-development/test-driven-development/SKILL.md');
    assert.deepEqual(skill?.tags, ['testing', 'development']);
    assert(skill?.environments?.includes('engineering'));
    assert(skill?.environments?.includes('qa'));
    assert.equal(loader.getSkill('example'), undefined);
  });

  test('normalizes copied skill package names and descriptions before exposing them', async () => {
    const legacySkillName = ['debugging', legacySkillBrandLower, 'tui-commands'].join('-');
    const parser = {
      exists: async () => true,
      parseAll: async () =>
        new Map([
          [
            `catalog/skills/software-development/${legacySkillName}/SKILL`,
            {
              frontmatter: {
                name: legacySkillName,
                description: `Debug ${legacySkillBrandTitle} TUI slash commands`,
                metadata: { cast: { tags: [legacySkillAgentSlug, 'debugging'] } },
              },
              content: `Use ${legacySkillAgentTitle} tools.`,
            },
          ],
        ]),
    };

    const loader = new SkillLoaderService(parser as any);
    await loader.loadSkills();
    const skill = loader.getSkill('debugging-cast-tui-commands');

    assert.equal(skill?.name, 'debugging-cast-tui-commands');
    assert.equal(skill?.description, 'Debug Cast TUI slash commands');
    assert.deepEqual(skill?.tags, ['cast-agent', 'debugging']);
    assert.doesNotMatch(loader.getSkillNames().join('\n'), legacySkillBrandPattern);
    assert.doesNotMatch(skill?.guidelines ?? '', legacySkillBrandPattern);
  });

  test('quarantines copied jailbreak skills by default', async () => {
    const parser = {
      exists: async () => true,
      parseAll: async () =>
        new Map([
          [
            'catalog/skills/red-teaming/godmode/SKILL',
            {
              frontmatter: {
                name: 'godmode',
                description: 'Jailbreak LLMs',
                metadata: { cast: { tags: ['jailbreak', 'safety-bypass'] } },
              },
              content: 'Bypass safety filters.',
            },
          ],
        ]),
    };

    const loader = new SkillLoaderService(parser as any);
    await loader.loadSkills();
    const skill = loader.getAllUnscopedSkills()[0];

    assert.equal(skill?.risk, 'critical');
    assert.equal(skill?.trust, 'quarantined');
    assert.equal(skill?.isActive, false);
    assert.equal(loader.getSkill('godmode'), undefined);
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

  test('preserves remote governed skill metadata when loading platform skills', () => {
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
        source: 'remote',
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
    assert.equal(skill?.source, 'remote');
    assert.equal(skill?.sourceRepo, undefined);
    assert.equal(skill?.sourcePath, 'skills/campaign-strategy/SKILL.md');
    assert.equal(skill?.trust, 'community');
    assert.equal(skill?.risk, 'high');
    assert.deepEqual(skill?.tags, ['campaign']);
    assert.deepEqual(skill?.environments, ['marketing']);
    assert.equal(skill?.scannerFindings?.[0]?.category, 'prompt_injection');
    assert.equal(skill?.isActive, false);
    assert.equal(loader.getSkill('campaign-strategy'), undefined);
  });

  test('applies sidecar metadata before heuristic classification and resolves aliases', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cast-loader-index-'));
    try {
      const skillRoot = path.join(root, 'catalog/skills/creative/creative-ideation');
      await mkdir(skillRoot, { recursive: true });
      await writeFile(
        path.join(skillRoot, 'SKILL.md'),
        [
          '---',
          'name: ideation',
          'description: Generate project ideas',
          'metadata:',
          '  cast:',
          '    tags: [creative, ideation]',
          '---',
          '',
          'Generate ideas.',
        ].join('\n'),
        'utf-8',
      );
      await writeFile(
        path.join(root, 'skill-metadata.cast-skill-index.yaml'),
        [
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
          '    risk: medium',
          '    trust: community',
        ].join('\n'),
        'utf-8',
      );

      const loader = new SkillLoaderService(new MarkdownParserService(), new SkillMetadataIndexService());
      (loader as any).definitionsPath = root;
      await loader.loadSkills();

      const skill = loader.getSkill('ideation');
      assert.equal(skill?.category, 'creative');
      assert.deepEqual(skill?.aliases, ['creative-ideation']);
      assert.deepEqual(skill?.environments, ['marketing']);
      assert.deepEqual(skill?.profiles, ['marketing:campaign']);
      assert.equal(skill?.risk, 'medium');
      assert.equal(loader.getSkill('creative-ideation')?.name, 'ideation');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
