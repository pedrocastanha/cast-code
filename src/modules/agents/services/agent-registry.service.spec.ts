import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AgentRegistryService } from './agent-registry.service';

describe('AgentRegistryService execution rules', () => {
  test('injects the adaptive test-first workflow into resolved sub-agents', () => {
    const service = new AgentRegistryService(
      {
        getAgent: () => ({
          name: 'coder',
          description: 'coding agent',
          model: 'gpt-4.1-mini',
          temperature: 0.1,
          skills: [],
          mcp: [],
          systemPrompt: 'Base coder prompt.',
        }),
      } as any,
      {
        getIsolatedToolsForSkills: () => [],
        getToolsForSkills: () => [],
        getGuidelinesForSkills: () => '',
        getAllSkills: () => [],
      } as any,
      {
        getIsolatedTools: () => [],
        getTools: () => [],
      } as any,
      {
        getMcpTools: () => [],
      } as any,
    );

    const agent = service.resolveAgent('coder');

    assert(agent);
    assert.match(agent.systemPrompt, /Adaptive Test-First Workflow/);
    assert.match(agent.systemPrompt, /Ask clarifying questions only when ambiguity affects behavior/);
    assert.match(agent.systemPrompt, /complex module has likely side effects/);
    assert.match(agent.systemPrompt, /write or update the smallest meaningful failing test first/);
  });
});
