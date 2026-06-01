import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { MemoryService } = require('../dist/modules/memory/services/memory.service.js');
const { StateDbService } = require('../dist/modules/state/services/state-db.service.js');

const root = await mkdtemp(join(tmpdir(), 'cast-memory-smoke-'));
const homeDir = join(root, 'home');
const projectRoot = join(root, 'project');
const previousHome = process.env.HOME;
const previousDbPath = process.env.CAST_STATE_DB_PATH;
const previousCwd = process.cwd();

process.env.HOME = homeDir;
delete process.env.CAST_STATE_DB_PATH;
process.chdir(root);

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

try {
  const memory = app.get(MemoryService);
  const stateDb = app.get(StateDbService);
  const expectedDbPath = join(homeDir, '.cast', 'state.db');

  await memory.initialize(projectRoot);
  await memory.write('USER.md', '# User Memory\n\n- O usuario gosta de ser chamado de castanha-tchan.\n');

  const searchOutput = await memory.search('qual meu apelido?');
  if (!/castanha-tchan/.test(searchOutput)) {
    throw new Error(`Expected memory search to find nickname, got: ${searchOutput}`);
  }

  const db = await stateDb.getDb();
  const migration = db.prepare('select 1 from state_meta where name = ?').get('0006_local_memory');
  if (!migration) {
    throw new Error('Expected 0006_local_memory migration to be applied.');
  }

  const row = db.prepare(`
    select count(*) as count
    from local_memory_entries
    where project_root = ? and filename = ?
  `).get(projectRoot, 'USER.md');
  if (row.count !== 1) {
    throw new Error(`Expected one USER.md memory entry, found ${row.count}`);
  }

  if (stateDb.getDbPath() !== expectedDbPath || !existsSync(expectedDbPath)) {
    throw new Error(`Expected state db at ${expectedDbPath}, got ${stateDb.getDbPath()}`);
  }

  console.log('MEMORY_SMOKE_OK', JSON.stringify({
    dbPath: expectedDbPath,
    migration: '0006_local_memory',
    search: 'castanha-tchan',
  }));
} finally {
  await app.close();
  process.chdir(previousCwd);
  if (previousHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = previousHome;
  }
  if (previousDbPath === undefined) {
    delete process.env.CAST_STATE_DB_PATH;
  } else {
    process.env.CAST_STATE_DB_PATH = previousDbPath;
  }
  await rm(root, { recursive: true, force: true });
}
