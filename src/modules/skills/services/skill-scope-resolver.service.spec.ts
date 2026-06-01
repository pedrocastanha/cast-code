import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SkillScopeResolverService } from './skill-scope-resolver.service';
import { SkillVersionService } from './skill-version.service';
import { SkillDefinition } from '../types';

describe('SkillScopeResolverService', () => {
  test('resolves active skills by scope precedence and reports alias conflicts', () => {
    const resolver = new SkillScopeResolverService(new SkillVersionService());
    const builtin: SkillDefinition = {
      name: 'api-contracts',
      description: 'Built-in API contracts',
      tools: [],
      guidelines: 'builtin',
      source: 'builtin',
      aliases: ['api'],
    };
    const project: SkillDefinition = {
      name: 'api-contracts',
      description: 'Project API contracts',
      tools: [],
      guidelines: 'project',
      source: 'local',
      definitionPath: '/repo/.cast/skills/api-contracts.md',
      aliases: ['api'],
    };
    const other: SkillDefinition = {
      name: 'service-design',
      description: 'Service design',
      tools: [],
      guidelines: 'service',
      source: 'builtin',
      aliases: ['api'],
    };

    const resolution = resolver.resolveAll([builtin, project, other], { projectRoot: '/repo' });
    const active = resolution.records.find((record) => record.name === 'api-contracts' && record.status === 'active');
    const shadowed = resolution.records.find((record) => record.name === 'api-contracts' && record.status === 'shadowed');

    assert.equal(active?.scope, 'project');
    assert.equal(active?.description, 'Project API contracts');
    assert.equal(shadowed?.scope, 'builtin');
    assert.equal(shadowed?.shadowedBy?.scope, 'project');
    assert.equal(resolution.conflicts.length, 1);
    assert.equal(resolution.conflicts[0].alias, 'api');
  });
});
