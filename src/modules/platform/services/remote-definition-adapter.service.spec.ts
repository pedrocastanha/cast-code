import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RemoteDefinitionAdapterService } from './remote-definition-adapter.service';

describe('RemoteDefinitionAdapterService', () => {
  test('adapts remote skills and parses markdown frontmatter', () => {
    const service = new RemoteDefinitionAdapterService();

    const [skill] = service.adaptSkills([
      {
        name: 'api-design',
        content: ['---', 'description: API patterns', 'tools:', '  - read_file', '---', '# API'].join('\n'),
        updatedAt: '2026-04-29T12:00:00.000Z',
      },
    ]);

    assert.equal(skill.name, 'api-design');
    assert.equal(skill.description, 'API patterns');
    assert.deepEqual(skill.tools, ['read_file']);
    assert.equal(skill.guidelines.trim(), '# API');
    assert.equal(skill.source, 'remote');
    assert.equal(skill.updatedAt, '2026-04-29T12:00:00.000Z');
  });

  test('adapts remote agent defaults safely', () => {
    const service = new RemoteDefinitionAdapterService();

    const [agent] = service.adaptAgents([
      {
        role: 'reviewer',
        model: null,
        systemPrompt: 'Review code safely',
        updatedAt: '2026-04-29T12:00:00.000Z',
      },
    ]);

    assert.equal(agent.name, 'reviewer');
    assert.equal(agent.description, 'Remote platform agent');
    assert.equal(agent.systemPrompt, 'Review code safely');
    assert.equal(agent.skills.length, 0);
    assert.equal(agent.mcp.length, 0);
    assert.equal(agent.source, 'remote');
  });
});
