import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { ReplayService } = require('../dist/modules/replay/services/replay.service.js');
const { AgentRunService } = require('../dist/modules/agents/services/agent-run.service.js');
const { SkillReloadService } = require('../dist/modules/skills/services/skill-reload.service.js');

const root = await mkdtemp(join(tmpdir(), 'cast-agentic-runtime-v2-'));
const homeDir = join(root, 'home');
const projectRoot = join(root, 'project');
const skillsDir = join(projectRoot, '.cast', 'skills');

const previousHome = process.env.HOME;
const previousReplayDir = process.env.CAST_REPLAYS_DIR;
const previousTraceDir = process.env.CAST_TRACE_DIR;
const previousCwd = process.cwd();

process.env.HOME = homeDir;
process.env.CAST_REPLAYS_DIR = join(root, 'replays');
process.env.CAST_TRACE_DIR = join(root, 'traces');

await mkdir(skillsDir, { recursive: true });
await writeFile(join(skillsDir, 'api-contracts.md'), [
  '---',
  'name: api-contracts',
  'description: Runtime smoke skill',
  'tools: [read_file]',
  '---',
  '',
  '# Guidelines',
  'Design stable API contracts.',
  '',
].join('\n'));

process.chdir(projectRoot);
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

try {
  const replay = app.get(ReplayService);
  const agentRuns = app.get(AgentRunService);
  const skillReload = app.get(SkillReloadService);

  replay.recordEntry({ role: 'user', content: 'agentic runtime smoke' });

  const reload = await skillReload.reloadSkill('api-contracts', { projectRoot });
  if (!reload.ok || reload.records[0]?.scope !== 'project') {
    throw new Error(`Expected project skill reload, got ${JSON.stringify(reload)}`);
  }

  const run = agentRuns.createRun({
    agentName: 'api-engineer',
    task: 'Produce a read-only health endpoint contract',
    inputContract: {
      prompt: 'Read-only contract design.',
      fileOwnership: [{ path: 'src/health', mode: 'read' }],
      toolScope: ['read_file'],
      requiredSkills: ['api-contracts'],
      expectedOutput: { kind: 'analysis', requiredSections: ['Summary', 'Contract'] },
      acceptanceCriteria: ['Do not edit files'],
    },
  });
  agentRuns.startRun(run.id);
  agentRuns.completeRun(run.id, [{
    kind: 'handoff',
    title: 'Health Contract',
    content: 'GET /health returns 200 with service status.',
  }]);

  replay.save('agentic-runtime-v2-smoke');
  const timeline = replay.getTimeline('agentic-runtime-v2-smoke');
  const types = timeline.events.map((event) => event.type);
  for (const expected of ['session.started', 'session.message', 'skill.reloaded', 'agent.queued', 'agent.started', 'agent.completed']) {
    if (!types.includes(expected)) {
      throw new Error(`Missing trace event ${expected}. Got ${types.join(', ')}`);
    }
  }

  const exported = replay.exportTrace('agentic-runtime-v2-smoke', 'jsonl');
  if (!exported.content.includes('agent.completed') || !exported.content.includes('skill.reloaded')) {
    throw new Error('Expected exported JSONL to include agent and skill events.');
  }
  if (!existsSync(timeline.session.trace.tracePath)) {
    throw new Error(`Expected trace file at ${timeline.session.trace.tracePath}`);
  }

  console.log('AGENTIC_RUNTIME_V2_SMOKE_OK', JSON.stringify({
    events: timeline.events.length,
    skill: reload.records[0].name,
    agentRun: run.id,
    tracePath: timeline.session.trace.tracePath,
  }));
} finally {
  await app.close();
  process.chdir(previousCwd);
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousReplayDir === undefined) delete process.env.CAST_REPLAYS_DIR;
  else process.env.CAST_REPLAYS_DIR = previousReplayDir;
  if (previousTraceDir === undefined) delete process.env.CAST_TRACE_DIR;
  else process.env.CAST_TRACE_DIR = previousTraceDir;
  await rm(root, { recursive: true, force: true });
}
