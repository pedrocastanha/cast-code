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
  test('prints agent runtime runs and run details', async () => {
    const run = {
      id: 'run-api-1',
      parentRunId: 'root',
      agentName: 'api-engineer',
      status: 'completed',
      task: 'Design a health endpoint',
      inputContract: {
        prompt: 'Design only.',
        fileOwnership: [{ path: 'src/health', mode: 'read' }],
        toolScope: ['read_file'],
        requiredSkills: ['api-design'],
        expectedOutput: { kind: 'analysis', requiredSections: ['Summary'] },
        acceptanceCriteria: ['No edits'],
      },
      skills: [{ name: 'api-design', scope: 'builtin', version: 'abc123', reason: 'agent_required' }],
      tools: [{ name: 'read_file', reason: 'agent_default' }],
      artifacts: [{ kind: 'handoff', title: 'Contract', content: 'GET /health' }],
      errors: [],
      startedAt: '2026-05-19T00:00:00.000Z',
      endedAt: '2026-05-19T00:00:01.000Z',
      durationMs: 1000,
    };
    const service = new AgentCommandsService(
      { resolveAllAgents: () => [] } as any,
      { getAllSkills: () => [] } as any,
      undefined,
      undefined,
      {
        listRuns: () => [run],
        getRun: (id: string) => id === run.id ? run : undefined,
      } as any,
    );

    const runsOutput = await captureStdout(() => service.cmdAgents(['runs'], {} as any));
    assert.match(runsOutput, /run-api-1/);
    assert.match(runsOutput, /api-engineer/);
    assert.match(runsOutput, /completed/);

    const showOutput = await captureStdout(() => service.cmdAgents(['show', 'run-api-1'], {} as any));
    assert.match(showOutput, /Design a health endpoint/);
    assert.match(showOutput, /api-design/);
    assert.match(showOutput, /GET \/health/);
  });

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

  test('routes skill runtime reload, effective inspect, and conflicts', async () => {
    const service = new AgentCommandsService(
      { resolveAllAgents: () => [] } as any,
      {
        getAllSkills: () => [],
        getAllUnscopedSkills: () => [{
          name: 'api-contracts',
          description: 'Project API contracts',
          tools: [],
          guidelines: 'Guide.',
          source: 'local',
          definitionPath: '/repo/.cast/skills/api-contracts.md',
          aliases: ['api'],
        }],
        getSkillDefinition: () => ({
          name: 'api-contracts',
          description: 'Project API contracts',
          tools: [],
          guidelines: 'Guide.',
          source: 'local',
          definitionPath: '/repo/.cast/skills/api-contracts.md',
          aliases: ['api'],
          supportFiles: [],
        }),
      } as any,
      undefined,
      undefined,
      undefined,
      {
        reloadSkill: async () => ({
          ok: true,
          message: 'Reloaded api-contracts',
          records: [{ name: 'api-contracts', scope: 'project', version: 'abc123def456', status: 'active' }],
          errors: [],
          warnings: [],
        }),
        reloadAll: async () => ({
          ok: true,
          message: 'Reloaded 1 skills',
          records: [{ name: 'api-contracts', scope: 'project', version: 'abc123def456', status: 'active' }],
          errors: [],
          warnings: [],
        }),
      } as any,
      {
        resolveSkill: () => ({
          name: 'api-contracts',
          description: 'Project API contracts',
          scope: 'project',
          sourcePath: '/repo/.cast/skills/api-contracts.md',
          version: 'abc123def456',
          status: 'active',
          aliases: ['api'],
          activationReasons: [],
          supportFiles: [],
          shadows: [],
          reload: { changedFiles: [], warnings: [], errors: [] },
        }),
        getConflicts: () => [{ alias: 'api', records: [{ name: 'api-contracts', scope: 'project' }, { name: 'service-design', scope: 'builtin' }] }],
      } as any,
    );

    const reloadOutput = await captureStdout(() => service.cmdSkills(['reload', 'api-contracts'], {} as any));
    assert.match(reloadOutput, /Reloaded api-contracts/);
    assert.match(reloadOutput, /abc123def456/);

    const inspectOutput = await captureStdout(() => service.cmdSkills(['inspect', 'api-contracts', '--effective'], {} as any));
    assert.match(inspectOutput, /Effective/);
    assert.match(inspectOutput, /project/);
    assert.match(inspectOutput, /abc123def456/);

    const conflictsOutput = await captureStdout(() => service.cmdSkills(['conflicts'], {} as any));
    assert.match(conflictsOutput, /api/);
    assert.match(conflictsOutput, /service-design/);
  });
});
