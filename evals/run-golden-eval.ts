import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

import { MarkdownParserService } from '../src/common/services/markdown-parser.service';
import { AgentLoaderService } from '../src/modules/agents/services/agent-loader.service';
import { EnvironmentLoaderService } from '../src/modules/environments/services/environment-loader.service';
import { SkillLoaderService } from '../src/modules/skills/services/skill-loader.service';
import { SkillMetadataIndexService } from '../src/modules/skills/services/skill-metadata-index.service';

interface EvalRecord {
  id: string;
  environment: string;
  profile?: string;
  prompt: string;
  expectedSkills?: string[];
  forbiddenSkills?: string[];
  expectedAgents?: string[];
}

interface EvalResult {
  id: string;
  status: 'pass' | 'fail';
  expectedSkills: string[];
  actualSkills: string[];
  expectedAgents: string[];
  actualAgents: string[];
  failures: string[];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const suite = readArg(args, '--suite') || 'skill-selection';
  const fixture = readArg(args, '--fixture') || defaultFixture(suite);
  const records = await readJsonl(fixture);
  const context = await loadContext();
  const results: EvalResult[] = [];

  for (const record of records) {
    results.push(evaluateRecord(record, context));
  }

  fsSync.writeFileSync(1, results.map((result) => JSON.stringify(result)).join('\n') + '\n');

  const failures = results.filter((result) => result.status === 'fail');
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function loadContext(): Promise<{
  environmentLoader: EnvironmentLoaderService;
  skillLoader: SkillLoaderService;
  agentLoader: AgentLoaderService;
}> {
  const parser = new MarkdownParserService();
  const skillLoader = new SkillLoaderService(parser, new SkillMetadataIndexService());
  const agentLoader = new AgentLoaderService(parser);
  await skillLoader.loadSkills();
  await agentLoader.loadAgents();
  return {
    environmentLoader: new EnvironmentLoaderService(),
    skillLoader,
    agentLoader,
  };
}

function evaluateRecord(
  record: EvalRecord,
  context: Awaited<ReturnType<typeof loadContext>>,
): EvalResult {
  const environment = loadEnvironmentSync(context.environmentLoader, record.environment);
  const scoped = record.profile
    ? resolveProfile(environment, record.profile)
    : environment;

  const actualSkills = unique([...scoped.skills.required, ...scoped.skills.optional]);
  const actualAgents = unique([scoped.defaultAgent, ...scoped.agents.required, ...scoped.agents.optional]);
  const expectedSkills = record.expectedSkills ?? [];
  const expectedAgents = record.expectedAgents ?? [];
  const failures: string[] = [];

  for (const skill of expectedSkills) {
    if (!actualSkills.includes(skill)) failures.push(`missing expected skill ${skill}`);
  }
  for (const skill of record.forbiddenSkills ?? []) {
    if (actualSkills.includes(skill)) failures.push(`forbidden skill leaked ${skill}`);
  }
  for (const agent of expectedAgents) {
    if (!actualAgents.includes(agent)) failures.push(`missing expected agent ${agent}`);
  }
  for (const skill of actualSkills) {
    if (!context.skillLoader.getUnscopedSkill(skill)) failures.push(`scope references unknown skill ${skill}`);
  }
  for (const agent of actualAgents) {
    if (!context.agentLoader.getAllUnscopedAgents().some((candidate) => candidate.name === agent)) {
      failures.push(`scope references unknown agent ${agent}`);
    }
  }

  return {
    id: record.id,
    status: failures.length === 0 ? 'pass' : 'fail',
    expectedSkills,
    actualSkills,
    expectedAgents,
    actualAgents,
    failures,
  };
}

function loadEnvironmentSync(loader: EnvironmentLoaderService, environmentId: string): any {
  const builtinDir = path.join(__dirname, '..', 'src/modules/environments/manifests');
  const yaml = require('js-yaml');
  const fsSync = require('node:fs');
  const filePath = path.join(builtinDir, `${environmentId}.cast-env.yaml`);
  const parsed = yaml.load(fsSync.readFileSync(filePath, 'utf8'));
  return {
    ...parsed,
    source: 'builtin',
    profiles: parsed.profiles ?? {},
  };
}

function resolveProfile(environment: any, profileId: string): any {
  const profile = environment.profiles?.[profileId];
  if (!profile) {
    throw new Error(`Profile not found: ${environment.id}:${profileId}`);
  }
  const hasMembers = (value: any) => value && ((value.required ?? []).length > 0 || (value.optional ?? []).length > 0);
  return {
    ...environment,
    activeProfile: profileId,
    defaultAgent: profile.defaultAgent || environment.defaultAgent,
    agents: hasMembers(profile.agents) ? profile.agents : environment.agents,
    skills: hasMembers(profile.skills) ? profile.skills : environment.skills,
    mcp: profile.mcp ?? environment.mcp,
  };
}

async function readJsonl(filePath: string): Promise<EvalRecord[]> {
  const content = await fs.readFile(path.resolve(filePath), 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvalRecord);
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function defaultFixture(suite: string): string {
  if (suite === 'environment-leaks') {
    return 'evals/fixtures/environment-leaks.jsonl';
  }
  return 'evals/fixtures/skill-selection.jsonl';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
