import assert from 'node:assert/strict';
import { describe, test, beforeEach, afterEach } from 'node:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigManagerService } from './config-manager.service';
import { I18nService } from '../../i18n/services/i18n.service';

function newService(): ConfigManagerService {
  return new ConfigManagerService(new I18nService());
}

describe('ConfigManagerService.maskSecret', () => {
  test('masks all but the last four characters', () => {
    assert.equal(ConfigManagerService.maskSecret('abcd1234'), '••••1234');
  });

  test('fully masks short secrets', () => {
    assert.equal(ConfigManagerService.maskSecret('abc'), '••••');
  });

  test('returns empty string for undefined', () => {
    assert.equal(ConfigManagerService.maskSecret(undefined), '');
  });
});

describe('ConfigManagerService Azure config', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-azure-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('setAzureRepoConfig writes file and gitignores .cast/', async () => {
    const svc = newService();
    await svc.setAzureRepoConfig(tmp, { repository: 'my-repo', targetBranch: 'main' });

    const repoFile = fs.readFileSync(path.join(tmp, '.cast', 'config.yaml'), 'utf-8');
    assert.match(repoFile, /repository: my-repo/);
    assert.match(repoFile, /targetBranch: main/);

    const gitignore = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf-8');
    assert.ok(gitignore.split('\n').some((l) => l.trim() === '.cast/'));
  });

  test('getAzureConfig merges global with per-repo (per-repo wins)', async () => {
    const svc = newService();
    (svc as any).config = {
      version: 1,
      providers: {},
      models: {},
      azureDevops: {
        pat: 'secret-pat',
        organizationUrl: 'https://dev.azure.com/org',
        project: 'Proj',
        reviewers: ['a@b.com'],
      },
    };
    (svc as any).loaded = true;

    await svc.setAzureRepoConfig(tmp, { repository: 'repo-x', targetBranch: 'develop' });
    const resolved = await svc.getAzureConfig(tmp);

    assert.ok(resolved);
    assert.equal(resolved!.pat, 'secret-pat');
    assert.equal(resolved!.organizationUrl, 'https://dev.azure.com/org');
    assert.equal(resolved!.project, 'Proj');
    assert.equal(resolved!.repository, 'repo-x');
    assert.equal(resolved!.targetBranch, 'develop');
  });

  test('getAzureConfig returns undefined without a PAT', async () => {
    const svc = newService();
    (svc as any).config = { version: 1, providers: {}, models: {} };
    (svc as any).loaded = true;
    const resolved = await svc.getAzureConfig(tmp);
    assert.equal(resolved, undefined);
  });

  test('getAzureConfig falls back to remote defaults for repository', async () => {
    const svc = newService();
    (svc as any).config = {
      version: 1,
      providers: {},
      models: {},
      azureDevops: { pat: 'p', organizationUrl: 'https://dev.azure.com/org', project: 'Proj' },
    };
    (svc as any).loaded = true;
    const resolved = await svc.getAzureConfig(tmp, { repository: 'from-remote' });
    assert.equal(resolved!.repository, 'from-remote');
  });

  test('setAzureGlobalConfig rejects missing required fields', async () => {
    const svc = newService();
    (svc as any).config = { version: 1, providers: {}, models: {} };
    (svc as any).loaded = true;
    await assert.rejects(
      () => svc.setAzureGlobalConfig({ pat: '', organizationUrl: 'x', project: 'y' }),
      /Personal Access Token is required/,
    );
  });
});
