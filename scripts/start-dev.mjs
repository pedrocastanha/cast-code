import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tsNodeRegister = require.resolve('ts-node/register/transpile-only');
const mainPath = join(packageRoot, 'src/main.ts');
const nodeArgs = args.length > 0
  ? ['-r', tsNodeRegister, mainPath, ...args]
  : ['--watch', '-r', tsNodeRegister, mainPath];
const cwd = args.length > 0 ? process.env.INIT_CWD || process.cwd() : process.cwd();
const env = {
  ...process.env,
  TS_NODE_PROJECT: process.env.TS_NODE_PROJECT || join(packageRoot, 'tsconfig.json'),
};

const child = spawn(process.execPath, nodeArgs, { cwd, env, stdio: 'inherit' });

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
