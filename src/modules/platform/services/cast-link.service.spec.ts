import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { CastLinkService } from './cast-link.service';
import { PlatformClientService } from './platform-client.service';
import { PlatformConfigService } from './platform-config.service';

const makeProject = async () => mkdtemp(path.join(tmpdir(), 'cast-link-'));

describe('CastLinkService', () => {
  test('writes .cast/cast.yaml without storing the api key value', async () => {
    const projectRoot = await makeProject();
    const previousKey = process.env.CAST_API_KEY;
    try {
      process.env.CAST_API_KEY = 'csk_secret';
      const client = {
        authMe: async () => ({}),
        getProject: async () => ({
          project: { id: 'project-1', name: 'Project' },
          features: { remoteAgents: false, benchAccess: false, maxSkills: 5 },
          skills: [],
          agents: [],
        }),
      } as unknown as PlatformClientService;
      const service = new CastLinkService(new PlatformConfigService(), client);

      const result = await service.link(projectRoot, {
        projectId: 'project-1',
        apiUrl: 'http://localhost:3000',
        apiKeyEnv: 'CAST_API_KEY',
      });

      const manifest = await readFile(path.join(projectRoot, '.cast', 'cast.yaml'), 'utf8');
      assert.equal(result.status, 'linked');
      assert.match(manifest, /projectId: project-1/);
      assert.match(manifest, /apiUrl: http:\/\/localhost:3000/);
      assert.doesNotMatch(manifest, /csk_secret/);
    } finally {
      if (previousKey === undefined) delete process.env.CAST_API_KEY;
      else process.env.CAST_API_KEY = previousKey;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('returns usage error when project id is missing', async () => {
    const service = new CastLinkService(new PlatformConfigService(), {} as PlatformClientService);

    const result = await service.link('/tmp/project', { projectId: '' });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'error');
    assert.match(result.message, /Usage/);
  });

  test('does not persist a link when verification fails with an api key', async () => {
    const projectRoot = await makeProject();
    const previousKey = process.env.CAST_API_KEY;
    try {
      process.env.CAST_API_KEY = 'csk_secret';
      const client = {
        authMe: async () => {
          throw new Error('unauthorized');
        },
        getProject: async () => ({}),
      } as unknown as PlatformClientService;
      const service = new CastLinkService(new PlatformConfigService(), client);

      const result = await service.link(projectRoot, {
        projectId: 'project-1',
        apiUrl: 'http://localhost:3000',
        apiKeyEnv: 'CAST_API_KEY',
      });

      assert.equal(result.ok, false);
      assert.equal(result.status, 'error');
      await assert.rejects(() => stat(path.join(projectRoot, '.cast', 'cast.yaml')));
    } finally {
      if (previousKey === undefined) delete process.env.CAST_API_KEY;
      else process.env.CAST_API_KEY = previousKey;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test('rejects invalid link options instead of falling back to existing config', async () => {
    const projectRoot = await makeProject();
    const previousKey = process.env.CAST_API_KEY;
    try {
      process.env.CAST_API_KEY = 'csk_secret';
      const configService = new PlatformConfigService();
      await configService.writeLink(projectRoot, {
        projectId: 'old-project',
        apiUrl: 'https://api.castplatform.dev',
      });
      const client = {
        authMe: async () => ({}),
        getProject: async () => ({
          project: { id: 'new-project', name: 'Project' },
          features: { remoteAgents: false, benchAccess: false, maxSkills: 5 },
          skills: [],
          agents: [],
        }),
      } as unknown as PlatformClientService;
      const service = new CastLinkService(configService, client);

      const result = await service.link(projectRoot, {
        projectId: 'new-project',
        apiUrl: 'http://api.example.com',
      });

      const manifest = await readFile(path.join(projectRoot, '.cast', 'cast.yaml'), 'utf8');
      assert.equal(result.ok, false);
      assert.equal(result.status, 'error');
      assert.match(result.message, /HTTPS/);
      assert.match(manifest, /projectId: old-project/);
      assert.doesNotMatch(manifest, /http:\/\/api\.example\.com/);
    } finally {
      if (previousKey === undefined) delete process.env.CAST_API_KEY;
      else process.env.CAST_API_KEY = previousKey;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
