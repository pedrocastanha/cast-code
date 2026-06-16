import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  AzureDevopsService,
  AzureCommandRunner,
  CommandRunResult,
} from './azure-devops.service';

describe('AzureDevopsService.parseAzureRemote', () => {
  const svc = new AzureDevopsService();

  test('parses dev.azure.com HTTPS remote', () => {
    const info = svc.parseAzureRemote('https://dev.azure.com/myorg/MyProject/_git/my-repo');
    assert.deepEqual(info, {
      organizationUrl: 'https://dev.azure.com/myorg',
      project: 'MyProject',
      repository: 'my-repo',
    });
  });

  test('parses dev.azure.com HTTPS remote with .git suffix and user', () => {
    const info = svc.parseAzureRemote('https://myorg@dev.azure.com/myorg/MyProject/_git/my-repo.git');
    assert.equal(info.organizationUrl, 'https://dev.azure.com/myorg');
    assert.equal(info.repository, 'my-repo');
  });

  test('parses ssh v3 remote', () => {
    const info = svc.parseAzureRemote('git@ssh.dev.azure.com:v3/myorg/MyProject/my-repo');
    assert.deepEqual(info, {
      organizationUrl: 'https://dev.azure.com/myorg',
      project: 'MyProject',
      repository: 'my-repo',
    });
  });

  test('parses legacy visualstudio.com remote', () => {
    const info = svc.parseAzureRemote('https://myorg.visualstudio.com/MyProject/_git/my-repo');
    assert.equal(info.organizationUrl, 'https://myorg.visualstudio.com');
    assert.equal(info.project, 'MyProject');
    assert.equal(info.repository, 'my-repo');
  });

  test('returns empty for non-Azure remote', () => {
    assert.deepEqual(svc.parseAzureRemote('git@github.com:owner/repo.git'), {});
  });
});

describe('AzureDevopsService.buildCreateArgs', () => {
  const svc = new AzureDevopsService();

  test('includes required flags and omits target when absent', () => {
    const args = svc.buildCreateArgs({
      organizationUrl: 'https://dev.azure.com/org',
      project: 'Proj',
      repository: 'repo',
      sourceBranch: 'feature/x',
      title: 'Title',
      description: 'Body',
      pat: 'secret',
    });
    assert.ok(args.includes('--organization'));
    assert.ok(args.includes('--source-branch'));
    assert.ok(!args.includes('--target-branch'));
    assert.ok(!args.includes('secret'), 'PAT must never be in argv');
  });

  test('adds target branch and reviewers when provided', () => {
    const args = svc.buildCreateArgs({
      organizationUrl: 'https://dev.azure.com/org',
      project: 'Proj',
      repository: 'repo',
      sourceBranch: 'feature/x',
      targetBranch: 'main',
      title: 'Title',
      description: 'Body',
      reviewers: ['a@b.com', 'c@d.com'],
      pat: 'secret',
    });
    const ti = args.indexOf('--target-branch');
    assert.equal(args[ti + 1], 'main');
    const ri = args.indexOf('--required-reviewers');
    assert.deepEqual(args.slice(ri + 1), ['a@b.com', 'c@d.com']);
  });
});

describe('AzureDevopsService.createPr', () => {
  test('passes PAT via env, never argv, and returns web URL', () => {
    let seenEnvPat: string | undefined;
    let seenArgs: string[] = [];
    const runner: AzureCommandRunner = (command, args, opts): CommandRunResult => {
      if (args[0] === '--version') return { stdout: 'az 2.0', status: 0 };
      seenArgs = args;
      seenEnvPat = opts.pat;
      return { stdout: JSON.stringify({ pullRequestId: 42 }), status: 0 };
    };
    const svc = new AzureDevopsService().setRunner(runner);

    const res = svc.createPr({
      organizationUrl: 'https://dev.azure.com/org',
      project: 'Proj',
      repository: 'repo',
      sourceBranch: 'feature/x',
      targetBranch: 'main',
      title: 'Title',
      description: 'Body',
      pat: 'super-secret',
    }, '/tmp');

    assert.equal(res.success, true);
    assert.equal(res.url, 'https://dev.azure.com/org/Proj/_git/repo/pullrequest/42');
    assert.equal(seenEnvPat, 'super-secret');
    assert.ok(!seenArgs.includes('super-secret'));
  });

  test('surfaces az error verbatim', () => {
    const runner: AzureCommandRunner = (command, args): CommandRunResult => {
      if (args[0] === '--version') return { stdout: 'az 2.0', status: 0 };
      return { stdout: '', status: 1, stderr: 'TF401019: repo not found' };
    };
    const svc = new AzureDevopsService().setRunner(runner);
    const res = svc.createPr({
      organizationUrl: 'o', project: 'p', repository: 'r',
      sourceBranch: 's', title: 't', description: 'd', pat: 'x',
    }, '/tmp');
    assert.equal(res.success, false);
    assert.match(res.error || '', /TF401019/);
  });

  test('reports missing az CLI', () => {
    const runner: AzureCommandRunner = (): CommandRunResult => ({ stdout: '', status: 127, stderr: 'not found' });
    const svc = new AzureDevopsService().setRunner(runner);
    const res = svc.createPr({
      organizationUrl: 'o', project: 'p', repository: 'r',
      sourceBranch: 's', title: 't', description: 'd', pat: 'x',
    }, '/tmp');
    assert.equal(res.success, false);
    assert.match(res.error || '', /Azure CLI \(az\) not found/);
  });
});
