import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { PlatformConfigService } from './platform-config.service';

const makeProject = async () => mkdtemp(path.join(tmpdir(), 'cast-platform-config-'));

describe('PlatformConfigService', () => {
  test('returns disabled config when .cast/cast.yaml is missing', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformConfigService();
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
      const service = new PlatformConfigService();
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

  test('allows localhost http api urls', async () => {
    const projectRoot = await makeProject();
    try {
      const service = new PlatformConfigService();
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
      const service = new PlatformConfigService();
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

  test('invalid yaml disables platform without throwing', async () => {
    const projectRoot = await makeProject();
    try {
      await import('node:fs/promises').then((fs) =>
        fs.mkdir(path.join(projectRoot, '.cast'), { recursive: true }).then(() =>
          fs.writeFile(path.join(projectRoot, '.cast', 'cast.yaml'), 'platform: ['),
        ),
      );

      const service = new PlatformConfigService();
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
      const service = new PlatformConfigService();
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
