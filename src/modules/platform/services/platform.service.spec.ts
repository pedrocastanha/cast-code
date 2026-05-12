import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PlatformService } from './platform.service';
import { PlatformConfig, PlatformProjectPayload } from '../types';

const enabledConfig: PlatformConfig = {
  enabled: true,
  projectRoot: '/tmp/project',
  projectId: 'project-1',
  apiKeyEnv: 'CAST_API_KEY',
  apiUrl: 'https://api.cast.test',
};

const payload: PlatformProjectPayload = {
  fetchedAt: new Date().toISOString(),
  project: { id: 'project-1', name: 'Project' },
  features: { remoteAgents: true, benchAccess: false, maxSkills: 5 },
  skills: [{ name: 'remote-skill', content: '# Remote' }],
  agents: [{ role: 'reviewer', model: null, systemPrompt: 'Review' }],
  mcp: [{
    serverId: 'brave-search',
    isEnabled: true,
    config: { envVarNames: ['BRAVE_API_KEY'], commandRef: 'builtin:brave-search' },
  }],
  settings: {
    ragEnabled: true,
    rag: {
      topK: 7,
      useGraph: true,
      graphDepth: 2,
      agentInstruction: 'Use rag_search before answering project docs questions.',
    },
  },
};

const buildService = (overrides: Record<string, any> = {}) => {
  const deps = {
    configService: { readConfig: async () => enabledConfig, getApiKey: () => 'secret-key' },
    client: { authMe: async () => ({}), getProject: async () => payload },
    cache: {
      writeProjectCache: async () => {},
      readProjectCache: async () => null,
      isProjectCacheUsable: () => false,
      readPendingEvents: async () => [],
      clearPendingEvents: async () => {},
    },
    adapter: {
      adaptSkills: () => [{ name: 'remote-skill', description: '', tools: [], guidelines: '# Remote', source: 'remote' }],
      adaptAgents: () => [{ name: 'reviewer', description: '', model: 'default', temperature: 0, skills: [], mcp: [], systemPrompt: 'Review', source: 'remote' }],
      adaptMcpConfigs: () => ({ 'brave-search': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] } }),
    },
    skillRegistry: { loadRemoteSkills: () => [] },
    agentRegistry: { loadRemoteAgents: () => [] },
    mcpRegistry: { loadConfigs: () => {} },
    tracker: { start: async () => {}, track: () => {}, flush: async () => {}, close: async () => {} },
    ...overrides,
  };

  return new PlatformService(
    deps.configService as any,
    deps.client as any,
    deps.cache as any,
    deps.adapter as any,
    deps.skillRegistry as any,
    deps.agentRegistry as any,
    deps.mcpRegistry as any,
    deps.tracker as any,
  );
};

describe('PlatformService', () => {
  test('disabled config returns disabled status', async () => {
    const service = buildService({
      configService: { readConfig: async () => ({ ...enabledConfig, enabled: false }), getApiKey: () => undefined },
    });

    const result = await service.bootstrap('/tmp/project');

    assert.equal(result.status, 'disabled');
  });

  test('online boot auths, fetches project, caches payload, and loads remote definitions', async () => {
    let cacheWrites = 0;
    let skillsLoaded = 0;
    let agentsLoaded = 0;
    let mcpLoaded = 0;
    const service = buildService({
      cache: {
        writeProjectCache: async () => { cacheWrites += 1; },
        readProjectCache: async () => null,
        isProjectCacheUsable: () => false,
        readPendingEvents: async () => [],
        clearPendingEvents: async () => {},
      },
      skillRegistry: { loadRemoteSkills: () => { skillsLoaded += 1; return []; } },
      agentRegistry: { loadRemoteAgents: () => { agentsLoaded += 1; return []; } },
      mcpRegistry: { loadConfigs: () => { mcpLoaded += 1; } },
    });

    const result = await service.bootstrap('/tmp/project');

    assert.equal(result.status, 'online');
    assert.equal(cacheWrites, 1);
    assert.equal(skillsLoaded, 1);
    assert.equal(agentsLoaded, 1);
    assert.equal(mcpLoaded, 1);
    assert.equal(service.getFeatures()?.maxSkills, 5);
    assert.match(service.getRagInstruction(), /Use rag_search before answering/);
  });

  test('retrieveMemory uses active platform config and default rag topK', async () => {
    let request: unknown;
    const service = buildService({
      client: {
        authMe: async () => ({}),
        getProject: async () => payload,
        retrieveMemory: async (_config: unknown, _apiKey: unknown, input: unknown) => {
          request = input;
          return { results: [{ unitId: 'unit-1', content: 'Auth docs', score: 0.8, related: [] }] };
        },
      },
    });

    await service.bootstrap('/tmp/project');
    const result = await service.retrieveMemory('auth docs');

    assert.deepEqual(request, { query: 'auth docs', topK: 7 });
    assert.equal(result.results[0].unitId, 'unit-1');
  });

  test('memoryOverview uses active platform config', async () => {
    let called = false;
    const service = buildService({
      client: {
        authMe: async () => ({}),
        getProject: async () => payload,
        memoryOverview: async () => {
          called = true;
          return {
            stats: { sources: 1, readySources: 1, units: 2, edges: 0, retrievalMode: 'vector' },
            sources: [{ title: 'Brand guide', status: 'ready', unitCount: 2 }],
            units: [],
            graph: { nodes: [], edges: [] },
          };
        },
      },
    });

    await service.bootstrap('/tmp/project');
    const overview = await service.memoryOverview();

    assert.equal(called, true);
    assert.equal(overview.sources[0].title, 'Brand guide');
  });

  test('session start failure does not make successful config fetch offline', async () => {
    const service = buildService({
      tracker: {
        start: async () => {
          throw new Error('session endpoint down');
        },
        track: () => {},
        flush: async () => {},
        close: async () => {},
      },
    });

    const result = await service.bootstrap('/tmp/project');

    assert.equal(result.status, 'online');
    assert.equal(service.getProject()?.id, 'project-1');
  });

  test('network failure uses usable cache and returns offline status', async () => {
    let skillsLoaded = 0;
    const service = buildService({
      client: { authMe: async () => { throw new Error('offline'); }, getProject: async () => payload },
      cache: {
        writeProjectCache: async () => {},
        readProjectCache: async () => payload,
        isProjectCacheUsable: () => true,
        readPendingEvents: async () => [],
        clearPendingEvents: async () => {},
      },
      skillRegistry: { loadRemoteSkills: () => { skillsLoaded += 1; return []; } },
    });

    const result = await service.bootstrap('/tmp/project');

    assert.equal(result.status, 'offline');
    assert.equal(result.source, 'cache');
    assert.equal(skillsLoaded, 1);
  });

  test('missing api key returns error without fetching project', async () => {
    let fetched = false;
    const service = buildService({
      configService: { readConfig: async () => enabledConfig, getApiKey: () => undefined },
      client: { authMe: async () => ({}), getProject: async () => { fetched = true; return payload; } },
    });

    const result = await service.bootstrap('/tmp/project');

    assert.equal(result.status, 'error');
    assert.equal(fetched, false);
  });
});
