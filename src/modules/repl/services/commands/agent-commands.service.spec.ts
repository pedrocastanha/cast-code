import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AgentCommandsService } from './agent-commands.service';

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stdout.write;

  try {
    await run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return output;
}

describe('AgentCommandsService skills import routing', () => {
  test('routes /skills import to the import command service', async () => {
    const calls: string[][] = [];
    const service = new AgentCommandsService(
      { resolveAllAgents: () => [] } as any,
      { getAllSkills: () => [] } as any,
      {
        handle: async (args: string[]) => {
          calls.push(args);
          return { ok: true, message: 'import summary' };
        },
      } as any,
    );

    const output = await captureStdout(() => service.cmdSkills(['import', '/tmp/skills', '--dry-run'], {} as any));

    assert.deepEqual(calls, [['import', '/tmp/skills', '--dry-run']]);
    assert.match(output, /import summary/);
  });

  test('prints skill inspection details without provenance source fields', async () => {
    const service = new AgentCommandsService(
      { resolveAllAgents: () => [] } as any,
      {
        getAllSkills: () => [],
        getSkillDefinition: (name: string) => name === 'creative-ideation'
          ? {
              name: 'ideation',
              description: 'Generate project ideas',
              tools: [],
              guidelines: 'Generate ideas.',
              source: 'builtin',
              sourceRepo: 'upstream/internal',
              sourcePath: 'skills/creative/creative-ideation/SKILL.md',
              aliases: ['creative-ideation'],
              category: 'creative',
              environments: ['marketing'],
              profiles: ['marketing:campaign'],
              risk: 'medium',
              trust: 'community',
              supportFiles: ['templates/example.md'],
            }
          : undefined,
      } as any,
    );

    const output = await captureStdout(() => service.cmdSkills(['inspect', 'creative-ideation'], {} as any));

    assert.match(output, /ideation/);
    assert.match(output, /creative-ideation/);
    assert.match(output, /medium/);
    assert.match(output, /templates\/example\.md/);
    assert.doesNotMatch(output, /Source/i);
    assert.doesNotMatch(output, /repo/i);
    assert.doesNotMatch(output, /sourcePath|Source path/i);
    assert.doesNotMatch(output, /upstream\/internal/);
  });
});
