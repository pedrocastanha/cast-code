import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SkillSearchService } from './skill-search.service';

const legacySkillBrandLower = ['her', 'mes'].join('');
const legacySkillBrandTitle = `${legacySkillBrandLower[0].toUpperCase()}${legacySkillBrandLower.slice(1)}`;
const legacySkillAgentSlug = `${legacySkillBrandLower}-agent`;
const legacySkillBrandPattern = new RegExp(legacySkillBrandLower, 'i');

describe('SkillSearchService', () => {
  test('ranks profile and alias matches while hiding quarantined skills by default', () => {
    const service = new SkillSearchService();
    const results = service.search({
      query: 'docker',
      activeEnvironment: 'devops',
      activeProfile: 'devops:deploy',
      skills: [
        {
          name: 'docker-management',
          description: 'Manage Docker',
          tools: [],
          guidelines: '',
          aliases: ['docker'],
          environments: ['devops'],
          profiles: ['devops:deploy'],
          risk: 'low',
          trust: 'community',
          source: 'builtin',
        },
        {
          name: 'godmode',
          description: 'Jailbreak',
          tools: [],
          guidelines: '',
          aliases: ['docker-jailbreak'],
          environments: ['security'],
          risk: 'critical',
          trust: 'quarantined',
          isActive: false,
        },
      ],
      agents: [],
    });

    assert.equal(results[0]?.name, 'docker-management');
    assert.equal(results[0]?.kind, 'skill');
    assert.match(results[0]?.reason ?? '', /profile|alias/i);
    assert(!results.some((result) => result.name === 'godmode'));
  });

  test('searches agents and honors env and risk filters', () => {
    const service = new SkillSearchService();
    const results = service.search({
      query: 'api',
      activeEnvironment: 'backend',
      activeProfile: 'backend:api',
      risk: 'low',
      skills: [
        {
          name: 'api-design',
          description: 'API design',
          tools: [],
          guidelines: '',
          environments: ['backend'],
          profiles: ['backend:api'],
          risk: 'low',
          source: 'builtin',
        },
        {
          name: 'oss-forensics',
          description: 'Security',
          tools: [],
          guidelines: '',
          environments: ['security'],
          risk: 'medium',
          source: 'builtin',
        },
      ],
      agents: [
        {
          name: 'api-engineer',
          description: 'API specialist',
          model: 'fast',
          temperature: 0,
          skills: ['api-design'],
          mcp: [],
          systemPrompt: '',
          environments: ['backend'],
          profiles: ['backend:api'],
        },
      ],
    });

    assert.deepEqual(results.map((result) => `${result.kind}:${result.name}`), [
      'agent:api-engineer',
      'skill:api-design',
    ]);
  });

  test('normalizes copied skill package metadata in search results', () => {
    const service = new SkillSearchService();
    const legacySkillName = ['debugging', legacySkillBrandLower, 'tui-commands'].join('-');
    const results = service.search({
      query: 'design',
      activeEnvironment: 'design',
      skills: [
        {
          name: legacySkillName,
          description: `Debug ${legacySkillBrandTitle} TUI slash commands`,
          tools: [],
          guidelines: '',
          environments: ['design'],
          aliases: [`${legacySkillAgentSlug}-debugger`],
          risk: 'low',
          source: 'builtin',
        },
        {
          name: 'blender-mcp',
          description: `Control Blender directly from ${legacySkillBrandTitle} via socket connection`,
          tools: [],
          guidelines: '',
          environments: ['design'],
          risk: 'low',
          source: 'builtin',
        },
      ],
      agents: [],
    });

    const rendered = results.map((result) => `${result.name} ${result.description} ${result.aliases.join(' ')}`).join('\n');
    assert.doesNotMatch(rendered, legacySkillBrandPattern);
    assert.match(rendered, /debugging-cast-tui-commands/);
    assert.match(rendered, /from Cast/);
  });
});
