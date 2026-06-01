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

  test('preserves governed metadata from remote skill payloads without provenance branding', () => {
    const service = new RemoteDefinitionAdapterService();

    const [skill] = service.adaptSkills([
      {
        name: 'campaign-strategy',
        content: '# Campaign Strategy',
        isActive: false,
        trust: 'community',
        risk: 'high',
        source: 'local',
        sourcePath: 'skills/campaign-strategy/SKILL.md',
        tags: ['campaign', 'strategy'],
        environments: ['marketing'],
        scannerFindings: [
          {
            category: 'prompt_injection',
            severity: 'high',
            message: 'Attempts to bypass instructions.',
          },
        ],
      },
    ]);

    assert.equal(skill.source, 'local');
    assert.equal(skill.sourceRepo, undefined);
    assert.equal(skill.sourcePath, 'skills/campaign-strategy/SKILL.md');
    assert.equal(skill.trust, 'community');
    assert.equal(skill.risk, 'high');
    assert.deepEqual(skill.tags, ['campaign', 'strategy']);
    assert.deepEqual(skill.environments, ['marketing']);
    assert.equal(skill.scannerFindings?.[0]?.category, 'prompt_injection');
    assert.equal(skill.isActive, false);
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

  test('adapts platform MCP summaries into local configs using env var references only', () => {
    const service = new RemoteDefinitionAdapterService();
    const previousBraveKey = process.env.BRAVE_API_KEY;
    delete process.env.MISSING_META_TOKEN;
    process.env.BRAVE_API_KEY = 'brave-secret';

    try {
      const configs = service.adaptMcpConfigs([
        {
          serverId: 'brave-search',
          isEnabled: true,
          config: {
            envVarNames: ['BRAVE_API_KEY', 'MISSING_META_TOKEN'],
            commandRef: 'builtin:brave-search',
          },
        },
        {
          serverId: 'disabled-server',
          isEnabled: false,
          config: {
            publicConfig: { endpoint: 'https://mcp.disabled.test' },
          },
        },
      ]);

      assert.equal(configs['brave-search'].type, 'stdio');
      assert.equal(configs['brave-search'].command, 'npx');
      assert.deepEqual(configs['brave-search'].env, { BRAVE_API_KEY: 'brave-secret' });
      assert.equal(configs['disabled-server'], undefined);
    } finally {
      if (typeof previousBraveKey === 'string') {
        process.env.BRAVE_API_KEY = previousBraveKey;
      } else {
        delete process.env.BRAVE_API_KEY;
      }
    }
  });

  test('adapts endpoint-only MCP summaries without accepting secret values', () => {
    const service = new RemoteDefinitionAdapterService();

    const configs = service.adaptMcpConfigs([
      {
        serverId: 'custom-http',
        isEnabled: true,
        config: {
          publicConfig: {
            endpoint: 'https://mcp.example.test/mcp',
            accessToken: 'must-not-be-used',
          },
        },
      },
    ]);

    assert.deepEqual(configs['custom-http'], {
      type: 'http',
      endpoint: 'https://mcp.example.test/mcp',
    });
  });
});
