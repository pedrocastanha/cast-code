import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, ['-r', 'ts-node/register', 'evals/run-golden-eval.ts', '--suite', 'environment-leaks', ...args], {
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
