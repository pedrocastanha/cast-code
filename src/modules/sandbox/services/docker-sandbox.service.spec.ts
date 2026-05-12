import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { StateRedactionService } from '../../state/services/state-redaction.service';
import { DockerSandboxService } from './docker-sandbox.service';
import type { SandboxCommandRunner } from '../types';

class FakeCommandRunner implements SandboxCommandRunner {
  calls: Array<{ command: string; args: string[] }> = [];

  constructor(
    private readonly exitCode: number,
    private readonly runOutput: { stdout?: string; stderr?: string; exitCode?: number } = {},
  ) {}

  async run(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.calls.push({ command, args });
    if (args[0] === 'run') {
      return {
        stdout: this.runOutput.stdout ?? '',
        stderr: this.runOutput.stderr ?? '',
        exitCode: this.runOutput.exitCode ?? 0,
      };
    }
    return { stdout: this.exitCode === 0 ? '24.0.0' : '', stderr: this.exitCode === 0 ? '' : 'docker unavailable', exitCode: this.exitCode };
  }
}

describe('DockerSandboxService', () => {
  test('reports unavailable when Docker cannot answer version', async () => {
    const runner = new FakeCommandRunner(1);
    const docker = new DockerSandboxService(runner as any);

    assert.equal(await docker.isAvailable(), false);
    assert.deepEqual(runner.calls[0], { command: 'docker', args: ['version', '--format', '{{.Server.Version}}'] });
  });

  test('defaults Docker sandbox network to none unless network is explicitly allowed', async () => {
    const docker = new DockerSandboxService(new FakeCommandRunner(0) as any);

    const isolated = await docker.prepare({ runId: 'run-1', projectRoot: '/project', config: { mode: 'docker' } });
    const networked = await docker.prepare({
      runId: 'run-2',
      projectRoot: '/project',
      config: { mode: 'docker', allowNetwork: true, docker: { image: 'node:22', network: 'bridge' } },
    });

    assert.match(isolated.commandLog.join('\n'), /network=none/);
    assert.match(networked.commandLog.join('\n'), /image=node:22/);
    assert.match(networked.commandLog.join('\n'), /network=bridge/);
  });

  test('builds container command with read-only mount, env allowlist, and redacted output preview', async () => {
    const previousKey = process.env.CAST_DOCKER_TEST_TOKEN;
    process.env.CAST_DOCKER_TEST_TOKEN = 'secret-token';
    const runner = new FakeCommandRunner(0, { stdout: 'CAST_DOCKER_TEST_TOKEN=secret-token\nok' });
    const docker = new DockerSandboxService(runner as any, new StateRedactionService());

    try {
      const context = await docker.prepare({
        runId: 'run-1',
        projectRoot: '/project',
        config: {
          mode: 'docker',
          docker: {
            image: 'node:22',
            envAllowlist: ['CAST_DOCKER_TEST_TOKEN', 'bad-key'],
          },
        },
      });
      await docker.runCommand(context, 'npm', ['test']);
      const dockerRun = runner.calls.find((call) => call.args[0] === 'run');

      assert(dockerRun);
      assert.deepEqual(dockerRun.args.slice(0, 4), ['run', '--rm', '--network', 'none']);
      assert.equal(dockerRun.args.includes('type=bind,src=/project,dst=/workspace,readonly'), true);
      assert.equal(dockerRun.args.includes('CAST_DOCKER_TEST_TOKEN'), true);
      assert.equal(dockerRun.args.includes('bad-key'), false);
      assert.match(context.commandLog.join('\n'), /CAST_DOCKER_TEST_TOKEN=\[REDACTED_SECRET\]/);
      assert.doesNotMatch(context.commandLog.join('\n'), /secret-token/);
    } finally {
      if (previousKey === undefined) {
        delete process.env.CAST_DOCKER_TEST_TOKEN;
      } else {
        process.env.CAST_DOCKER_TEST_TOKEN = previousKey;
      }
    }
  });
});
