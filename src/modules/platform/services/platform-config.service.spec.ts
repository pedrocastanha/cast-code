import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { PlatformConfigService } from './platform-config.service';

const makeProject = async () => mkdtemp(path.join(tmpdir(), 'cast-platform-config-'));
const isolatedConfigPath = (projectRoot: string) => path.join(projectRoot, 'missing-global-config.yaml');

describe('PlatformConfigService', () => {
  test('returns disabled config when .cast/cast.yaml is missing', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformConfigService(isolatedConfigPath(projectRoot));
      const config = await service.readConfig(projectRoot);

      assert.equal(config.enabled, false);
      assert.equal(config.projectRoot, projectRoot);
      assert.equal(config.apiKeyEnv, 'CAST_API_KEY');
      assert.equal(config.apiUrl, 'https://api.castplatform.dev');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('reads enabled platform config and applies defaults', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformConfigService(isolatedConfigPath(projectRoot));
      await service.writeLink(projectRoot, { projectId: 'project-1' });

      const config = await service.readConfig(projectRoot);

      assert.equal(config.enabled, true);
      assert.equal(config.projectId, 'project-1');
      assert.equal(config.apiKeyEnv, 'CAST_API_KEY');
      assert.equal(config.apiUrl, 'https://api.castplatform.dev');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('uses global platform key and api url without writing secrets to project manifest', async () => {
    const projectRoot = await makeProject();
    const globalRoot = await makeProject();
    const previousKey = process.env.CAST_API_KEY;
    try {
      delete process.env.CAST_API_KEY;
      const globalConfigPath = path.join(globalRoot, 'config.yaml');
      await mkdir(path.dirname(globalConfigPath), { recursive: true });
      await writeFile(
        globalConfigPath,
        [
          'version: 1',
          'platform:',
          '  apiKey: csk_global_secret',
          '  apiUrl: http://localhost:3022',
          '',
        ].join('\n'),
      );

      const service = new PlatformConfigService(globalConfigPath);
      const config = await service.buildConfig(projectRoot, { projectId: 'project-1' });

      assert.equal(config.enabled, true);
      assert.equal(config.apiUrl, 'http://localhost:3022');
      assert.equal(service.getApiKey(config), 'csk_global_secret');

      await service.writeLink(projectRoot, { projectId: 'project-1' });
      const manifest = await readFile(path.join(projectRoot, '.cast', 'cast.yaml'), 'utf8');
      assert.match(manifest, /projectId: project-1/);
      assert.match(manifest, /apiUrl: http:\/\/localhost:3022/);
      assert.doesNotMatch(manifest, /csk_global_secret/);
    } finally {
      if (previousKey === undefined) delete process.env.CAST_API_KEY;
      else process.env.CAST_API_KEY = previousKey;
      await rm(projectRoot, { recursive: true, force: true });
      await rm(globalRoot, { recursive: true, force: true });
    }
  });

  test('allows localhost http api urls', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformConfigService(isolatedConfigPath(projectRoot));
      await service.writeLink(projectRoot, {
        projectId: 'project-1',
        apiUrl: 'http://localhost:3000',
      });

      const config = await service.readConfig(projectRoot);

      assert.equal(config.enabled, true);
      assert.equal(config.apiUrl, 'http://localhost:3000');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('rejects non-localhost http api urls', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformConfigService(isolatedConfigPath(projectRoot));
      await service.writeLink(projectRoot, {
        projectId: 'project-1',
        apiUrl: 'http://api.example.com',
      });

      const config = await service.readConfig(projectRoot);

      assert.equal(config.enabled, false);
      assert.match(config.error || '', /HTTPS/);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('rejects apiKeyEnv values that are not environment variable names', async () => {
    const service = new PlatformConfigService(path.join(tmpdir(), 'cast-platform-config-missing.yaml'));

    const config = await service.buildConfig('/tmp/project', {
      projectId: 'project-1',
      apiKeyEnv: 'csk_secret_value',
      apiUrl: 'https://api.castplatform.dev',
    });

    assert.equal(config.enabled, false);
    assert.match(config.error || '', /environment variable name/i);
    assert.equal(config.apiKeyEnv, 'CAST_API_KEY');
  });

  test('disables existing links with invalid apiKeyEnv without exposing the value', async () => {
    const projectRoot = await makeProject();
    try {
      await import('node:fs/promises').then((fs) =>
        fs.mkdir(path.join(projectRoot, '.cast'), { recursive: true }).then(() =>
          fs.writeFile(
            path.join(projectRoot, '.cast', 'cast.yaml'),
            [
              'version: 1',
              'platform:',
              '  projectId: project-1',
              '  apiKeyEnv: csk_secret_value',
              '  apiUrl: https://api.castplatform.dev',
              '',
            ].join('\n'),
          ),
        ),
      );

      const service = new PlatformConfigService(isolatedConfigPath(projectRoot));
      const config = await service.readConfig(projectRoot);

      assert.equal(config.enabled, false);
      assert.equal(config.apiKeyEnv, 'CAST_API_KEY');
      assert.match(config.error || '', /environment variable name/i);
      assert.doesNotMatch(config.error || '', /csk_secret_value/);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('invalid yaml disables platform without throwing', async () => {
    const projectRoot = await makeProject();
    try {
      await import('node:fs/promises').then((fs) =>
        fs.mkdir(path.join(projectRoot, '.cast'), { recursive: true }).then(() =>
          fs.writeFile(path.join(projectRoot, '.cast', 'cast.yaml'), 'platform: ['),
        ),
      );

      const service = new PlatformConfigService(isolatedConfigPath(projectRoot));
      const config = await service.readConfig(projectRoot);

      assert.equal(config.enabled, false);
      assert.match(config.error || '', /Invalid/);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('writeLink preserves unrelated manifest keys and never writes api key values', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformConfigService(isolatedConfigPath(projectRoot));
      await service.writeLink(projectRoot, { projectId: 'old-project' });
      await import('node:fs/promises').then((fs) =>
        fs.writeFile(
          path.join(projectRoot, '.cast', 'cast.yaml'),
          [
            'version: 1',
            'project:',
            '  name: Existing',
            'platform:',
            '  projectId: old-project',
            '  apiKeyEnv: OLD_KEY',
            '',
          ].join('\n'),
        ),
      );

      await service.writeLink(projectRoot, {
        projectId: 'new-project',
        apiKeyEnv: 'CAST_API_KEY',
        apiUrl: 'https://api.castplatform.dev',
      });

      const written = await readFile(path.join(projectRoot, '.cast', 'cast.yaml'), 'utf8');
      assert.match(written, /project:\n\s+name: Existing/);
      assert.match(written, /projectId: new-project/);
      assert.match(written, /apiKeyEnv: CAST_API_KEY/);
      assert.doesNotMatch(written, /csk_/);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
