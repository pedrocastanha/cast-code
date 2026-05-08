import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DiscoveryToolsService } from './discovery-tools.service';

const buildService = () => new DiscoveryToolsService(
  { getAllAgents: () => [] } as any,
  { getAllSkills: () => [], getSkill: () => undefined, getSkillNames: () => [] } as any,
  { saveSnippet: () => {} } as any,
  { analyze: () => ({ summary: 'impact' }) } as any,
);

describe('DiscoveryToolsService cast_command', () => {
  test('exposes a cast_command tool for running REPL slash commands through the host handler', async () => {
    const service = buildService();
    const calls: string[] = [];
    service.setCastCommandHandler(async (command) => {
      calls.push(command);
      return `ran ${command}`;
    });

    const castCommand = service.getTools().find((tool) => tool.name === 'cast_command');
    assert(castCommand);

    const output = String(await castCommand.invoke({ command: '/status' }));

    assert.equal(output, 'ran /status');
    assert.deepEqual(calls, ['/status']);
  });

  test('rejects non-slash commands before reaching the host handler', async () => {
    const service = buildService();
    let called = false;
    service.setCastCommandHandler(async () => {
      called = true;
      return 'should not run';
    });

    const castCommand = service.getTools().find((tool) => tool.name === 'cast_command');
    assert(castCommand);

    const output = String(await castCommand.invoke({ command: 'git status' }));

    assert.equal(called, false);
    assert.match(output, /slash command/i);
  });
});
