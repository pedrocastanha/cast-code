import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const forwarded = args.length > 0 ? args : ['--suite', 'skill-selection'];
const result = spawnSync(process.execPath, ['-r', 'ts-node/register', 'evals/run-golden-eval.ts', ...forwarded], {
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
