import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const fixtureDir = resolve('evals/fixtures/e2e');
const artifactRoot = process.env.CAST_E2E_ARTIFACT_DIR || join(tmpdir(), `cast-e2e-${Date.now()}`);
await mkdir(artifactRoot, { recursive: true });

const files = (await readdir(fixtureDir)).filter((file) => file.endsWith('.json')).sort();
const results = [];

for (const file of files) {
  const scenario = JSON.parse(await readFile(join(fixtureDir, file), 'utf-8'));
  const evalInput = {
    id: scenario.id,
    environment: scenario.environment,
    profile: scenario.profile,
    prompt: scenario.prompt,
    expectedSkills: scenario.expectedSkills,
    forbiddenSkills: scenario.forbiddenSkills,
    expectedAgents: scenario.expectedAgents,
  };
  const fixturePath = join(artifactRoot, `${scenario.id}.jsonl`);
  await writeFile(fixturePath, `${JSON.stringify(evalInput)}\n`, 'utf-8');
  const run = spawnSync(process.execPath, [
    '-r',
    'ts-node/register',
    'evals/run-golden-eval.ts',
    '--fixture',
    fixturePath,
  ], { encoding: 'utf-8' });

  const output = run.stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const result = {
    id: scenario.id,
    status: run.status === 0 ? 'pass' : 'fail',
    environment: scenario.environment,
    profile: scenario.profile,
    expectedFiles: scenario.expectedFiles,
    commands: scenario.commands,
    graders: scenario.graders,
    eval: output[0] ?? null,
    stderr: run.stderr.trim(),
  };
  results.push(result);
  await mkdir(join(artifactRoot, scenario.id), { recursive: true });
  await writeFile(join(artifactRoot, scenario.id, 'grader-report.json'), JSON.stringify(result, null, 2), 'utf-8');
}

const summary = {
  artifactRoot,
  status: results.every((result) => result.status === 'pass') ? 'pass' : 'fail',
  results,
};
await writeFile(join(artifactRoot, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.status !== 'pass') {
  process.exitCode = 1;
}
