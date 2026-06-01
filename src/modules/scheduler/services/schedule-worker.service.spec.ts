import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { ScheduleWorkerService } from './schedule-worker.service';

describe('ScheduleWorkerService', () => {
  test('installs a Linux systemd user timer for the current project', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'cast-schedule-worker-home-'));
    const projectRoot = await mkdtemp(join(tmpdir(), 'cast-schedule-worker-project-'));
    const calls: Array<{ file: string; args: string[] }> = [];
    const service = new ScheduleWorkerService({
      platform: 'linux',
      homeDir,
      nodePath: '/usr/bin/node',
      nodeArgs: [],
      scriptPath: '/opt/cast/dist/main.js',
      execFile: async (file, args) => {
        calls.push({ file, args });
        if (args.includes('is-active')) return { stdout: 'active\n' };
        if (args.includes('is-enabled')) return { stdout: 'enabled\n' };
        return { stdout: '' };
      },
    });

    const result = await service.install({ projectRoot, intervalSeconds: 45 });

    assert.equal(result.platform, 'linux-systemd');
    assert.equal(result.installed, true);
    assert.equal(result.active, 'active');
    assert.equal(result.enabled, 'enabled');
    assert.ok(result.servicePath);
    assert.ok(result.timerPath);
    assert.match(await readFile(result.servicePath!, 'utf-8'), /ExecStart="\/usr\/bin\/node" "\/opt\/cast\/dist\/main\.js" "schedule" "tick" "--background" "--project-root"/);
    assert.match(await readFile(result.timerPath!, 'utf-8'), /OnUnitActiveSec=45s/);
    assert(calls.some((call) => call.file === 'systemctl' && call.args.join(' ') === '--user enable --now ' + result.timerName));
  });

  test('reports unsupported platforms without writing native routines', async () => {
    const service = new ScheduleWorkerService({
      platform: 'win32',
      homeDir: '/tmp/cast-worker',
      execFile: async () => ({ stdout: '' }),
    });

    const result = await service.install({ projectRoot: '/repo' });

    assert.equal(result.supported, false);
    assert.equal(result.platform, 'unsupported');
    assert.match(result.message, /not supported/);
  });
});
