import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AgentLoaderService } from './agent-loader.service';

describe('AgentLoaderService remote loading', () => {
  test('loads remote agents and lets local project agents override them', async () => {
    const parser = {
      exists: async () => true,
      parseAll: async () =>
        new Map([
          [
            'reviewer',
            {
              frontmatter: {
                name: 'reviewer',
                description: 'local reviewer',
                model: 'local-model',
                temperature: 0.1,
                skills: ['local-skill'],
                mcp: ['local-mcp'],
              },
              content: 'local prompt',
            },
          ],
        ]),
    };

    const loader = new AgentLoaderService(parser as any);
    loader.loadRemoteAgents([
      {
        name: 'reviewer',
        description: 'remote reviewer',
        model: 'remote-model',
        temperature: 0.7,
        skills: ['remote-skill'],
        mcp: ['remote-mcp'],
        systemPrompt: 'remote prompt',
        source: 'remote',
      },
    ]);

    await loader.loadFromPath('/project/.cast/agents');
    const agent = loader.getAgent('reviewer');

    assert.equal(agent?.description, 'local reviewer');
    assert.equal(agent?.model, 'local-model');
    assert.equal(agent?.temperature, 0.1);
    assert.deepEqual(agent?.skills, ['local-skill']);
    assert.deepEqual(agent?.mcp, ['local-mcp']);
    assert.equal(agent?.systemPrompt, 'local prompt');
    assert.equal(agent?.source, 'local');
  });

  test('reports remote names that override existing definitions', () => {
    const parser = {
      exists: async () => false,
      parseAll: async () => new Map(),
    };

    const loader = new AgentLoaderService(parser as any);
    loader.loadRemoteAgents([
      {
        name: 'reviewer',
        description: 'first',
        model: 'm1',
        temperature: 0,
        skills: [],
        mcp: [],
        systemPrompt: 'first',
        source: 'remote',
      },
    ]);
    const overridden = loader.loadRemoteAgents([
      {
        name: 'reviewer',
        description: 'second',
        model: 'm2',
        temperature: 0,
        skills: [],
        mcp: [],
        systemPrompt: 'second',
        source: 'remote',
      },
    ]);

    assert.deepEqual(overridden, ['reviewer']);
    assert.equal(loader.getAgent('reviewer')?.systemPrompt, 'second');
  });
});
