import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DeepAgentService } from './deep-agent.service';
import { EFFORT_PROFILES } from '../../config/types/config.types';

class HumanMessage {
  readonly role = 'user';
  constructor(public readonly content: string) {}
  _getType(): string { return 'human'; }
}

class AIMessage {
  readonly role = 'assistant';
  constructor(public readonly content: string) {}
  _getType(): string { return 'ai'; }
}

class ToolMessage {
  readonly role = 'tool';
  readonly content: string;
  readonly name: string;
  readonly tool_call_id: string;

  constructor(input: { content: string; name: string; tool_call_id: string }) {
    this.content = input.content;
    this.name = input.name;
    this.tool_call_id = input.tool_call_id;
  }

  _getType(): string { return 'tool'; }
}

const buildService = (overrides: Record<string, any> = {}) => {
  const defaultLlmClientFactory = {
    getCurrentEffortProfile: () => EFFORT_PROFILES.balanced,
    create: () => ({
      getModelName: () => 'test-model',
      getProviderName: () => 'test',
      invoke: async () => ({ role: 'assistant', content: '' }),
      stream: async function* () {},
    }),
  };
  const llmClientFactory = overrides.llmClientFactory ?? defaultLlmClientFactory;
  const deps = {
    agentRegistry: {},
    toolsRegistry: {},
    mcpRegistry: { getServerSummaries: () => [] },
    projectLoader: {},
    projectContext: {
      hasContext: () => false,
      getContextPrompt: () => '',
      getProjectStructureSummary: async () => '',
    },
    skillRegistry: { getSkillNames: () => [] },
    memoryService: {
      isInitialized: () => false,
      getCachedMemoryPrompt: () => '',
    },
    permissionService: {},
    statsService: { trackUsage: () => {}, setUsageListener: () => {} },
    replayService: { recordEntry: () => {}, setModel: () => {} },
    i18nService: {
      onLanguageChange: () => {},
      getAgentLanguageInstruction: () => '',
    },
    fileWatcherService: { on: () => {} },
    promptLoader: { getPrompt: () => '' },
    promptClassifier: { classify: () => [] },
    platformService: {
      getRagInstruction: () => '',
      track: () => {},
      bootstrap: async () => {},
    },
    localSessionStore: undefined,
    environmentResolver: undefined,
    agentRunService: undefined,
    ...overrides,
    llmClientFactory,
  };

  return new DeepAgentService(
    deps.llmClientFactory as any,
    deps.agentRegistry as any,
    deps.toolsRegistry as any,
    deps.mcpRegistry as any,
    deps.projectLoader as any,
    deps.projectContext as any,
    deps.skillRegistry as any,
    deps.memoryService as any,
    deps.permissionService as any,
    deps.statsService as any,
    deps.replayService as any,
    deps.i18nService as any,
    deps.fileWatcherService as any,
    deps.promptLoader as any,
    deps.promptClassifier as any,
    deps.platformService as any,
    deps.localSessionStore as any,
    deps.environmentResolver as any,
    deps.agentRunService as any,
  );
};

describe('DeepAgentService compact chat route', () => {
  test('records local messages and tool calls without blocking the main stream', async () => {
    const recorded: any[] = [];
    const service = buildService({
      localSessionStore: {
        recordMessage: async (input: any) => {
          recorded.push(['message', input]);
          return { id: `message-${recorded.length}`, createdAt: new Date().toISOString(), ...input };
        },
        recordToolCall: async (input: any) => {
          recorded.push(['tool', input]);
          return { id: `tool-${recorded.length}`, createdAt: new Date().toISOString(), ...input };
        },
      },
    });
    (service as any).setLocalSessionId('local-session-1');
    (service as any).agent = {
      streamEvents: async function* () {
        yield { event: 'on_tool_start', name: 'shell', run_id: 'tool-1', data: { input: { command: 'echo ok' } } };
        yield { event: 'on_tool_end', name: 'shell', run_id: 'tool-1', data: { output: 'done' } };
        yield { event: 'on_chat_model_stream', data: { chunk: { content: 'All done.' } } };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    assert.match(chunks.join(''), /All done/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(recorded.map(([kind]) => kind), ['message', 'tool', 'message']);
    assert.equal(recorded[0][1].role, 'user');
    assert.equal(recorded[0][1].sessionId, 'local-session-1');
    assert.equal(recorded[1][1].toolName, 'shell');
    assert.equal(recorded[1][1].status, 'ok');
    assert.equal(recorded[2][1].role, 'assistant');
  });

  test('keeps streaming when local tool input cannot be serialized', async () => {
    const recorded: any[] = [];
    const circular: any = { command: 'echo ok' };
    circular.self = circular;
    const service = buildService({
      localSessionStore: {
        recordMessage: async (input: any) => {
          recorded.push(['message', input]);
          return { id: `message-${recorded.length}`, createdAt: new Date().toISOString(), ...input };
        },
        recordToolCall: async (input: any) => {
          recorded.push(['tool', input]);
          return { id: `tool-${recorded.length}`, createdAt: new Date().toISOString(), ...input };
        },
      },
    });
    (service as any).setLocalSessionId('local-session-1');
    (service as any).agent = {
      streamEvents: async function* () {
        yield { event: 'on_tool_start', name: 'shell', run_id: 'tool-1', data: { input: circular } };
        yield { event: 'on_tool_end', name: 'shell', run_id: 'tool-1', data: { output: 'done' } };
        yield { event: 'on_chat_model_stream', data: { chunk: { content: 'All done.' } } };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    assert.match(chunks.join(''), /All done/);
    await new Promise((resolve) => setImmediate(resolve));
    const toolCall = recorded.find(([kind]) => kind === 'tool');
    assert.equal(toolCall[1].toolName, 'shell');
    assert.match(toolCall[1].inputRedacted, /unserializable/i);
  });

  test('streams through the DeepAgents event adapter and tracks sanitized runtime telemetry', async () => {
    const tracked: any[] = [];
    const adapterCalls: any[] = [];
    let seq = 0;
    const event = (type: string, payload: Record<string, unknown> = {}) => ({
      id: `evt_${++seq}`,
      seq,
      timestamp: '2026-05-21T00:00:00.000Z',
      type,
      scope: { kind: 'main', runId: 'run_adapter_1' },
      privacy: 'local',
      ...payload,
    });

    const service = buildService({
      platformService: {
        getRagInstruction: () => '',
        bootstrap: async () => {},
        track: (type: string, payload: Record<string, unknown>) => tracked.push({ type, payload }),
      },
    });
    (service as any).deepAgentEventAdapter = {
      stream: async function* (input: any) {
        adapterCalls.push(input);
        yield { sourceVersion: 'v2', runtimeEvent: event('runtime.run.started', { runtime: 'model' }) };
        yield {
          sourceVersion: 'v2',
          runtimeEvent: event('runtime.tool.started', { toolName: 'shell', callId: 'tool-1', input: { command: 'echo ok' } }),
          rawEvent: { event: 'on_tool_start', name: 'shell', run_id: 'tool-1', data: { input: { command: 'echo ok' } } },
        };
        yield {
          sourceVersion: 'v2',
          runtimeEvent: event('runtime.tool.completed', { toolName: 'shell', callId: 'tool-1', status: 'ok', summary: 'shell ok' }),
          rawEvent: { event: 'on_tool_end', name: 'shell', run_id: 'tool-1', data: { output: 'done' } },
        };
        yield {
          sourceVersion: 'v2',
          runtimeEvent: event('runtime.message.delta', { text: 'All done.' }),
          rawEvent: { event: 'on_chat_model_stream', data: { chunk: { content: 'All done.' } } },
        };
        yield {
          sourceVersion: 'v2',
          runtimeEvent: event('runtime.usage', { input: 4, output: 5 }),
          rawEvent: { event: 'on_chat_model_end', data: { output: { usage_metadata: { input_tokens: 4, output_tokens: 5 } } } },
        };
        yield { sourceVersion: 'v2', runtimeEvent: event('runtime.run.completed', { status: 'completed' }) };
      },
    };
    (service as any).runtimeTelemetryProjector = {
      project: (runtimeEvent: any) => {
        if (runtimeEvent.type.startsWith('runtime.message')) {
          return null;
        }
        return {
          type: runtimeEvent.type,
          ts: runtimeEvent.timestamp,
          payload: { runId: runtimeEvent.scope.runId, summary: runtimeEvent.summary },
        };
      },
    };
    (service as any).agent = {
      streamEvents: () => {
        throw new Error('direct streamEvents should not be used when the adapter is available');
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    assert.equal(adapterCalls.length, 1);
    assert.equal(adapterCalls[0].streamVersion, 'auto');
    assert.equal(adapterCalls[0].recursionLimit, Math.max(8, EFFORT_PROFILES.balanced.maxToolCalls * 2));
    assert.match(chunks.join(''), /All done/);
    assert.deepEqual(tracked.map((item) => item.type), [
      'runtime.run.started',
      'runtime.tool.started',
      'runtime.tool.completed',
      'runtime.usage',
      'runtime.run.completed',
    ]);
    assert.equal(tracked[2].payload.summary, 'shell ok');
  });

  test('extracts cached input tokens from provider usage metadata', () => {
    const service = buildService();

    assert.deepEqual((service as any).extractUsage({
      usage_metadata: {
        input_tokens: 2000,
        output_tokens: 120,
        input_token_details: { cache_read: 1536 },
      },
    }), {
      input: 2000,
      output: 120,
      cachedInput: 1536,
    });

    assert.deepEqual((service as any).extractUsage({
      response_metadata: {
        usage: {
          prompt_tokens: 2006,
          completion_tokens: 300,
          prompt_tokens_details: { cached_tokens: 1920 },
        },
      },
    }), {
      input: 2006,
      output: 300,
      cachedInput: 1920,
    });

    assert.deepEqual((service as any).extractUsage({
      response_metadata: {
        usage: {
          input_tokens: 3000,
          output_tokens: 120,
          cache_read_input_tokens: 2048,
        },
      },
    }), {
      input: 3000,
      output: 120,
      cachedInput: 2048,
    });

    assert.deepEqual((service as any).extractUsage({
      response_metadata: {
        usageMetadata: {
          inputTokenCount: 4096,
          candidatesTokenCount: 250,
          cachedContentTokenCount: 3072,
        },
      },
    }), {
      input: 4096,
      output: 250,
      cachedInput: 3072,
    });

    assert.deepEqual((service as any).extractUsage({
      response_metadata: {
        usage: {
          prompt_tokens: 4096,
          completion_tokens: 150,
          prompt_cache_hit_tokens: 3072,
        },
      },
    }), {
      input: 4096,
      output: 150,
      cachedInput: 3072,
    });
  });

  test('short greetings stream through the compact model without invoking the deep agent', async () => {
    let deepAgentCalls = 0;
    let trackedUsage: any = null;
    let capturedMessages: any[] = [];

    const service = buildService({
      statsService: {
        trackUsage: (model: string, inputTokens: number, outputTokens: number, cachedInputTokens: number) => {
          trackedUsage = { model, inputTokens, outputTokens, cachedInputTokens };
        },
        setUsageListener: () => {},
      },
    });

    (service as any).model = {
      modelName: 'gpt-4.1-mini',
      stream: async function* (messages: any[]) {
        capturedMessages = messages;
        yield { content: 'Oi' };
        yield { content: '! Posso ajudar com algo no projeto?', usage_metadata: { input_tokens: 8, output_tokens: 10 } };
      },
    };
    (service as any).agent = {
      streamEvents: () => {
        deepAgentCalls += 1;
        throw new Error('deep agent should not be used for compact greetings');
      },
    };
    (service as any).cachedBasePrompt = 'x'.repeat(20_000);
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('oi', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('oi')) {
      chunks.push(chunk);
    }

    assert.equal(deepAgentCalls, 0);
    assert.match(chunks.join(''), /Posso ajudar/);
    assert(capturedMessages.length <= 2, 'compact route should not send history or agent context');
    assert(
      String(capturedMessages[0].content).length < 500,
      'compact route should use a short system prompt',
    );
    assert.deepEqual(trackedUsage, {
      model: 'gpt-4.1-mini',
      inputTokens: 8,
      outputTokens: 10,
      cachedInputTokens: 0,
    });
  });

  test('capability questions stream through the compact model in the user language', async () => {
    let deepAgentCalls = 0;
    let capturedMessages: any[] = [];

    const service = buildService({
      i18nService: {
        onLanguageChange: () => {},
        getAgentLanguageInstruction: () => 'Responda sempre em português do Brasil.',
      },
    });

    (service as any).model = {
      modelName: 'gpt-4.1-mini',
      stream: async function* (messages: any[]) {
        capturedMessages = messages;
        yield { content: 'Posso explicar código, ajudar com bugs e orientar próximos passos.' };
      },
    };
    (service as any).agent = {
      streamEvents: () => {
        deepAgentCalls += 1;
        throw new Error('deep agent should not be used for compact capability questions');
      },
    };
    (service as any).cachedBasePrompt = 'x'.repeat(20_000);
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('o que vc pode fazer?', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('o que vc pode fazer?')) {
      chunks.push(chunk);
    }

    const output = chunks.join('');
    assert.equal(deepAgentCalls, 0);
    assert.match(output, /Posso explicar código/);
    assert.doesNotMatch(output, /list agents|Available Sub-Agents|▶/i);
    assert(
      String(capturedMessages[0].content).includes('Reply in the user language'),
      'compact prompt should explicitly preserve the user language',
    );
    assert(
      String(capturedMessages[0].content).length < 700,
      'capability questions should not send the full agent prompt',
    );
  });

  test('saves a shutdown session summary with replay path in local memory', async () => {
    const writes: Array<{ filename: string; content: string }> = [];
    const service = buildService({
      llmClientFactory: {
        getCurrentEffortProfile: () => EFFORT_PROFILES.balanced,
        create: () => ({
          invoke: async () => ({
            content: 'Implementamos memoria persistente com SQLite e mantivemos guardrails.',
          }),
        }),
      },
      memoryService: {
        isInitialized: () => true,
        getCachedMemoryPrompt: () => '',
        write: async (filename: string, content: string) => {
          writes.push({ filename, content });
          return `Memory saved: ${filename}`;
        },
      },
      replayService: {
        recordEntry: () => {},
        setModel: () => {},
        saveSnapshot: () => ({
          name: 'session-summary-2026-05-15',
          fileName: 'session-summary-2026-05-15.json',
          filePath: '/home/user/.cast/replays/session-summary-2026-05-15.json',
          entries: 4,
        }),
      },
    });
    (service as any).messages = [
      new HumanMessage('vamos melhorar memoria'),
      new AIMessage('ok, vou implementar'),
      new HumanMessage('inclui path da conversa resumida'),
      new AIMessage('vou salvar junto do resumo'),
    ];

    const result = await service.saveSessionSummaryToMemory({ timeoutMs: 1000 });

    assert.equal(result.saved, true);
    assert.equal(writes.length, 1);
    assert.match(writes[0].filename, /^session-summary-/);
    assert.match(writes[0].content, /SQLite/);
    assert.match(writes[0].content, /\/home\/user\/\.cast\/replays\/session-summary-2026-05-15\.json/);
    assert.match(writes[0].content, /\/replay show session-summary-2026-05-15/);
  });

  test('skips shutdown session summary when there is not enough conversation', async () => {
    let saveSnapshotCalled = false;
    const service = buildService({
      memoryService: {
        isInitialized: () => true,
        getCachedMemoryPrompt: () => '',
        write: async () => {
          throw new Error('memory write should not run');
        },
      },
      replayService: {
        recordEntry: () => {},
        setModel: () => {},
        saveSnapshot: () => {
          saveSnapshotCalled = true;
          return { name: 'short', fileName: 'short.json', filePath: '/tmp/short.json', entries: 1 };
        },
      },
    });
    (service as any).messages = [
      new HumanMessage('oi'),
      new AIMessage('ola'),
    ];

    const result = await service.saveSessionSummaryToMemory({ timeoutMs: 1000 });

    assert.equal(result.saved, false);
    assert.equal(result.reason, 'too_few_messages');
    assert.equal(saveSnapshotCalled, false);
  });
});

describe('DeepAgentService system prompt engineering workflow', () => {
  test('base prompt advertises discovery without eager tool or sub-agent catalogs', () => {
    const service = buildService({
      promptLoader: {
        getPrompt: () => [
          '{{language_instruction}}',
          'Use list_skills, read_skill, list_agents, list_commands, and cast_command when needed.',
          'Tools available:',
          '{{tool_names}}',
          '{{subagents_section}}',
        ].join('\n'),
      },
    });
    const tools = [
      { name: 'read_file', description: 'Read files' },
      { name: 'very_expensive_tool_catalog_entry', description: 'UNIQUE_TOOL_DESCRIPTION_SHOULD_NOT_BE_PRELOADED' },
      { name: 'cast_command', description: 'Run Cast commands' },
    ];
    const subagents = [
      {
        name: 'frontend-pro',
        description: 'UNIQUE_SUBAGENT_DESCRIPTION_SHOULD_NOT_BE_PRELOADED',
        systemPrompt: '- UNIQUE_SUBAGENT_GUIDELINE_SHOULD_NOT_BE_PRELOADED',
      },
    ];

    const prompt = (service as any).buildBasePrompt(tools, subagents);

    assert.match(prompt, /list_skills/);
    assert.match(prompt, /read_skill/);
    assert.match(prompt, /list_agents/);
    assert.match(prompt, /list_commands/);
    assert.match(prompt, /cast_command/);
    assert.doesNotMatch(prompt, /very_expensive_tool_catalog_entry/);
    assert.doesNotMatch(prompt, /UNIQUE_TOOL_DESCRIPTION_SHOULD_NOT_BE_PRELOADED/);
    assert.doesNotMatch(prompt, /UNIQUE_SUBAGENT_DESCRIPTION_SHOULD_NOT_BE_PRELOADED/);
    assert.doesNotMatch(prompt, /UNIQUE_SUBAGENT_GUIDELINE_SHOULD_NOT_BE_PRELOADED/);
    assert(prompt.length < 3_800, `base prompt should stay compact, got ${prompt.length} chars`);
  });

  test('contextual prompt does not preload full project structure by effort', () => {
    const service = buildService({
      llmClientFactory: {
        getCurrentEffortProfile: () => EFFORT_PROFILES.max,
      },
    });
    (service as any).cachedBasePrompt = 'Base prompt';
    (service as any).cachedProjectStructure = [
      'UNIQUE_PROJECT_STRUCTURE_LINE_SHOULD_NOT_BE_PRELOADED',
      ...Array.from({ length: 300 }, (_, i) => `src/large/module-${i}.ts`),
    ].join('\n');

    const prompt = (service as any).buildContextualPrompt('implemente a feature', false);

    assert.doesNotMatch(prompt, /UNIQUE_PROJECT_STRUCTURE_LINE_SHOULD_NOT_BE_PRELOADED/);
    assert.doesNotMatch(prompt, /src\/large\/module-299\.ts/);
    assert.match(prompt, /Use ls\/glob\/grep/i);
    assert(prompt.length < 1_800, `contextual prompt should stay compact, got ${prompt.length} chars`);
  });

  test('default base prompt relies on agent discovery instead of hard-coded agent names', () => {
    const basePrompt = readFileSync(join(process.cwd(), 'src/prompts/defaults/base.md'), 'utf8');

    assert.match(basePrompt, /list_agents/);
    assert.doesNotMatch(basePrompt, /`(?:backend|coder|frontend|architect|tester|reviewer|devops)`/);
    assert.doesNotMatch(basePrompt, /task\(subagent_type: "(?:backend|coder|frontend|architect|tester|reviewer|devops)"/);
  });

  test('initialization loads persistent memory into the prompt cache', async () => {
    let loadedMemory = false;
    const service = buildService({
      llmClientFactory: {
        getCurrentEffortProfile: () => EFFORT_PROFILES.balanced,
        create: () => ({
          getModelName: () => 'gpt-4.1-mini',
          getProviderName: () => 'test',
          invoke: async () => ({ role: 'assistant', content: '' }),
          stream: async function* () {},
        }),
      },
      projectLoader: {
        detectProject: async () => '/repo',
        detectWorkspaceRoot: async () => '/repo',
        loadProject: async () => ({}),
        getAgentsOverridePath: () => '/repo/.cast/agents',
        getLegacyAgentsOverridePath: () => '/repo/.agents',
        getSkillsOverridePath: () => '/repo/.cast/skills',
        getLegacySkillsOverridePath: () => '/repo/.skills',
      },
      toolsRegistry: {
        setRootDir: () => {},
        getAllTools: () => [],
      },
      mcpRegistry: {
        loadConfigs: () => {},
        connectAll: async () => {},
        getAllMcpTools: () => [],
        getDiscoveryTools: () => [],
        getServerSummaries: () => [],
      },
      agentRegistry: {
        loadProjectAgents: async () => {},
        getSubagentDefinitions: () => [],
      },
      skillRegistry: {
        loadProjectSkills: async () => {},
        getSkillNames: () => [],
      },
      memoryService: {
        initialize: async () => {},
        getMemoryPrompt: async () => {
          loadedMemory = true;
          return '# User Memory\n- castanha-tchan';
        },
        isInitialized: () => true,
        getCachedMemoryPrompt: () => loadedMemory ? '# User Memory\n- castanha-tchan' : '',
      },
      promptLoader: {
        getPrompt: () => [
          '{{language_instruction}}',
          '{{tool_names}}',
          '{{subagents_section}}',
        ].join('\n'),
      },
    });

    await service.initialize();
    const prompt = (service as any).buildContextualPrompt('como eu gosto de ser chamado?', false);

    assert.equal(loadedMemory, true);
    assert.match(prompt, /castanha-tchan/);
  });

  test('context tool set keeps MCP tools lazy until MCP context is active', () => {
    const service = buildService();
    (service as any).cachedExtraTools = [{ name: 'shell' }, { name: 'list_agents' }];
    (service as any).cachedMcpDiscoveryTools = [{ name: 'mcp_list_tools' }];
    (service as any).cachedMcpTools = [{ name: 'figma_get_file' }];

    assert.deepEqual(
      (service as any).selectContextTools([]).map((tool: any) => tool.name),
      ['shell', 'list_agents', 'mcp_list_tools'],
    );
    assert.deepEqual(
      (service as any).selectContextTools(['mcp']).map((tool: any) => tool.name),
      ['shell', 'list_agents', 'mcp_list_tools', 'figma_get_file'],
    );
  });

  test('context sub-agents stay lazy except for planning or delegation turns', () => {
    const service = buildService();
    (service as any).cachedSubagents = [{ name: 'reviewer' }, { name: 'frontend' }];

    assert.deepEqual((service as any).selectContextSubagents('fala comigo', []), []);
    assert.deepEqual(
      (service as any).selectContextSubagents('planeje a refatoracao do modulo', ['planning']).map((agent: any) => agent.name),
      ['reviewer', 'frontend'],
    );
    assert.deepEqual(
      (service as any).selectContextSubagents('delega isso para um agent', []).map((agent: any) => agent.name),
      ['reviewer', 'frontend'],
    );
  });

  test('requires adaptive clarification and test-first implementation for code changes', () => {
    const service = buildService();

    const prompt = (service as any).buildLeanSystemPrompt();

    assert.match(prompt, /Adaptive Test-First Workflow/);
    assert.match(prompt, /Ask clarifying questions only when ambiguity affects behavior/);
    assert.match(prompt, /complex module has likely side effects/);
    assert.match(prompt, /write or update the smallest meaningful failing test first/);
    assert.match(prompt, /Do not ask questions just to delay clear work/);
    assert.match(prompt, /Missing tests are not ambiguity/);
    assert.match(prompt, /clear file extension is enough to infer the language/);
  });

  test('identifies clear single-file code edits as lean execution candidates', () => {
    const service = buildService();

    assert.equal(
      (service as any).shouldUseLeanCodeAgent(
        'Adicione validacao em src/discount.js: applyDiscount deve lancar RangeError quando percent for menor que 0 ou maior que 1. Escreva o teste antes de implementar e rode npm test.',
        false,
      ),
      true,
    );

    assert.equal(
      (service as any).shouldUseLeanCodeAgent(
        'Refatore o backend inteiro e atualize auth/dtos/login.dto.ts e billing/service.ts',
        false,
      ),
      false,
    );

    assert.equal(
      (service as any).shouldUseLeanCodeAgent('Faz o mesmo ajuste nesse arquivo', false),
      false,
    );
  });

  test('lean prompt includes local test framework hints without sub-agent context', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'cast-lean-prompt-'));
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ type: 'module', scripts: { test: 'node --test' } }),
    );

    try {
      const service = buildService();
      (service as any).projectRoot = projectRoot;

      const prompt = (service as any).buildLeanSystemPrompt();

      assert.match(prompt, /npm test -> node --test/);
      assert.match(prompt, /Use node:test/);
      assert.match(prompt, /\.js import extensions/);
      assert.match(prompt, /same language as the user request/i);
      assert.match(prompt, /do not use describe\/it\/expect globals/i);
      assert.match(prompt, /continue until the red test and final green verification have both run/i);
      assert.match(prompt, /Use read_file, not shell, to inspect file contents/i);
      assert.match(prompt, /After writing a test, run it before editing production code/i);
      assert.match(prompt, /After a green test run, report what changed and do not ask whether to implement/i);
      assert.doesNotMatch(prompt, /Available Sub-Agents|list_agents|delegate to agent/i);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('filesystem backend defaults to project root while allowing sibling workspace folders', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'cast-deep-workspace-'));
    const projectRoot = join(workspace, 'cast-code');
    const webRoot = join(workspace, 'web');
    mkdirSync(projectRoot);
    mkdirSync(webRoot);
    writeFileSync(join(projectRoot, 'package.json'), '{"name":"cast-code"}');
    writeFileSync(join(webRoot, 'package.json'), '{"name":"web"}');

    try {
      const service = buildService();
      (service as any).projectRoot = projectRoot;
      (service as any).workspaceRoot = workspace;
      const backend = (service as any).createFilesystemBackend();

      const projectEntries = await backend.ls('.');
      const webEntries = await backend.ls('../web');
      const blocked = await backend.read('/etc/passwd');

      assert.equal((projectEntries.files ?? []).some((entry: { path: string }) => entry.path.endsWith('cast-code/package.json')), true);
      assert.equal((webEntries.files ?? []).some((entry: { path: string }) => entry.path.endsWith('web/package.json')), true);
      assert.match(blocked.error ?? '', /outside workspace root/i);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('deep agent middleware enables the native QuickJS interpreter safely', async () => {
    const service = buildService();

    const middleware = await (service as any).buildDeepAgentMiddleware();

    assert.equal(middleware.length, 1);
    assert.equal(middleware[0].name, 'CodeInterpreterMiddleware');
    assert.deepEqual(middleware[0].tools.map((tool: any) => tool.name), ['eval']);
    assert.match(middleware[0].tools[0].description, /sandboxed REPL/i);
  });

  test('lean agent keeps only file edit and shell tools', () => {
    const service = buildService();
    const tools = [
      { name: 'read_file' },
      { name: 'write_file' },
      { name: 'edit_file' },
      { name: 'shell' },
      { name: 'task' },
      { name: 'memory_read' },
      { name: 'rag_search' },
    ];

    assert.deepEqual(
      (service as any).selectLeanTools(tools).map((tool: any) => tool.name),
      ['read_file', 'write_file', 'edit_file', 'shell'],
    );
  });

  test('lean agent exposes only the next useful tool group for the current TDD phase', () => {
    const service = buildService();
    const tools = [
      { name: 'read_file' },
      { name: 'write_file' },
      { name: 'edit_file' },
      { name: 'shell' },
    ];
    const human = new HumanMessage('Add validation in src/price.js and run npm test.');

    assert.deepEqual(
      (service as any).selectLeanStepTools([human], tools).map((tool: any) => tool.name),
      ['read_file'],
    );

    assert.deepEqual(
      (service as any).selectLeanStepTools([
        human,
        new ToolMessage({ content: '1: export function finalPrice() {}', name: 'read_file', tool_call_id: 'read' }),
      ], tools).map((tool: any) => tool.name),
      ['write_file', 'edit_file'],
    );

    assert.deepEqual(
      (service as any).selectLeanStepTools([
        human,
        new ToolMessage({ content: 'File written successfully: test/price.test.js', name: 'write_file', tool_call_id: 'write' }),
      ], tools).map((tool: any) => tool.name),
      ['shell'],
    );

    assert.deepEqual(
      (service as any).selectLeanStepTools([
        human,
        new ToolMessage({ content: 'Exit with error: not ok 1', name: 'shell', tool_call_id: 'red' }),
      ], tools).map((tool: any) => tool.name),
      ['read_file', 'write_file', 'edit_file', 'shell'],
    );

    assert.deepEqual(
      (service as any).selectLeanStepTools([
        human,
        new ToolMessage({ content: 'File edited successfully: src/price.js', name: 'edit_file', tool_call_id: 'edit' }),
      ], tools).map((tool: any) => tool.name),
      ['read_file', 'shell'],
    );

    assert.deepEqual(
      (service as any).selectLeanStepTools([
        human,
        new ToolMessage({ content: 'File edited successfully: src/price.js', name: 'edit_file', tool_call_id: 'edit' }),
        new ToolMessage({ content: '1: export function finalPrice() {}', name: 'read_file', tool_call_id: 'reread' }),
      ], tools).map((tool: any) => tool.name),
      ['shell'],
    );

    assert.deepEqual(
      (service as any).selectLeanStepTools([
        human,
        new ToolMessage({ content: 'ok 1\\n# pass 1\\n# fail 0', name: 'shell', tool_call_id: 'green' }),
      ], tools).map((tool: any) => tool.name),
      [],
    );

    assert.equal((service as any).getLeanToolChoice([{ name: 'shell' }]), 'required');
    assert.equal((service as any).getLeanToolChoice([]), undefined);
  });

  test('lean final response does not ask to implement work after green verification', () => {
    const service = buildService();

    (service as any).lastToolOutputs = [
      { tool: 'shell', output: 'ok 1\n# pass 3\n# fail 0' },
    ];

    const response = (service as any).sanitizeLeanFinalResponse(
      'Escrevi e rodei os testes. Ambos passaram.\n\nQuer que eu implemente a validacao em src/price.js agora?',
      'Adicione validacao em src/price.js e rode npm test.',
    );

    assert.match(response, /Escrevi e rodei os testes/);
    assert.doesNotMatch(response, /Quer que eu implemente/i);
    assert.doesNotMatch(response, /\?$/);
  });

  test('tool start output names delegated sub-agents with task description', () => {
    const service = buildService();

    const output = (service as any).formatToolStart('task', {
      subagent_type: 'reviewer',
      description: 'Review plan-mode behavior',
    });

    assert.match(output, /agent reviewer/);
    assert.match(output, /Review plan-mode behavior/);
    assert.doesNotMatch(output, /subagent_type=reviewer/);
  });

  test('records delegated task tool calls as agent runs', async () => {
    const calls: any[] = [];
    const agentRunService = {
      createRun: (input: any) => {
        calls.push(['create', input]);
        return {
          id: 'agent-run-1',
          parentRunId: 'root',
          status: 'queued',
          artifacts: [],
          errors: [],
          ...input,
        };
      },
      startRun: (id: string) => calls.push(['start', id]),
      completeRun: (id: string, artifacts: any[]) => calls.push(['complete', id, artifacts]),
      failRun: (id: string, error: any) => calls.push(['fail', id, error]),
    };
    const service = buildService({ agentRunService });
    (service as any).agent = {
      streamEvents: async function* () {
        yield {
          event: 'on_tool_start',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: {
            input: {
              subagent_type: 'reviewer',
              description: 'Review the proposed patch in parallel',
            },
          },
        };
        yield {
          event: 'on_tool_end',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: { output: 'Reviewer found no issues.' },
        };
        yield { event: 'on_chat_model_stream', data: { chunk: { content: 'Done.' } } };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    assert.match(chunks.join(''), /agent reviewer/);
    assert.deepEqual(calls.map(([kind]) => kind), ['create', 'start', 'complete']);
    assert.equal(calls[0][1].agentName, 'reviewer');
    assert.equal(calls[0][1].task, 'Review the proposed patch in parallel');
    assert.equal(calls[0][1].inputContract.prompt, 'Review the proposed patch in parallel');
    assert.deepEqual(calls[0][1].inputContract.requiredSkills, []);
    assert.equal(calls[1][1], 'agent-run-1');
    assert.equal(calls[2][1], 'agent-run-1');
    assert.equal(calls[2][2][0].kind, 'handoff');
    assert.match(calls[2][2][0].content, /Reviewer found no issues/);
  });

  test('records wrapped delegated task tool inputs as named agent runs', async () => {
    const calls: any[] = [];
    const agentRunService = {
      createRun: (input: any) => {
        calls.push(['create', input]);
        return {
          id: 'agent-run-1',
          parentRunId: 'root',
          status: 'queued',
          artifacts: [],
          errors: [],
          ...input,
        };
      },
      startRun: (id: string) => calls.push(['start', id]),
      completeRun: (id: string, artifacts: any[]) => calls.push(['complete', id, artifacts]),
    };
    const service = buildService({ agentRunService });
    (service as any).agent = {
      streamEvents: async function* () {
        yield {
          event: 'on_tool_start',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: {
            input: {
              input: JSON.stringify({
                subagent_type: 'backend',
                description: 'Inspect runtime implementation in parallel',
              }),
            },
          },
        };
        yield {
          event: 'on_tool_end',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: { output: 'Backend runtime is covered.' },
        };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    assert.match(chunks.join(''), /agent backend/);
    assert.match(chunks.join(''), /Inspect runtime implementation/);
    assert.equal(calls[0][1].agentName, 'backend');
    assert.equal(calls[0][1].task, 'Inspect runtime implementation in parallel');
    assert.match(calls[2][2][0].content, /Backend runtime is covered/);
  });

  test('hydrates delegated task runs from pending OpenAI tool call arguments', async () => {
    const calls: any[] = [];
    const agentRunService = {
      createRun: (input: any) => {
        calls.push(['create', input]);
        return {
          id: 'agent-run-1',
          parentRunId: 'root',
          status: 'queued',
          artifacts: [],
          errors: [],
          ...input,
        };
      },
      startRun: (id: string) => calls.push(['start', id]),
      completeRun: (id: string, artifacts: any[]) => calls.push(['complete', id, artifacts]),
    };
    const service = buildService({ agentRunService });
    (service as any).agent = {
      streamEvents: async function* () {
        yield {
          event: 'on_chat_model_end',
          data: {
            output: {
              kwargs: {
                additional_kwargs: {
                  tool_calls: [{
                    type: 'function',
                    function: {
                      name: 'task',
                      arguments: JSON.stringify({
                        subagent_type: 'tester',
                        description: 'Inspect observability and test gaps',
                      }),
                    },
                  }],
                },
              },
            },
          },
        };
        yield {
          event: 'on_tool_start',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: { input: {} },
        };
        yield {
          event: 'on_tool_end',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: { output: 'Test coverage is acceptable.' },
        };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    assert.match(chunks.join(''), /agent tester/);
    assert.equal(calls[0][1].agentName, 'tester');
    assert.equal(calls[0][1].task, 'Inspect observability and test gaps');
    assert.match(calls[2][2][0].content, /Test coverage is acceptable/);
  });

  test('hydrates delegated task runs from pending parsed tool calls', async () => {
    const calls: any[] = [];
    const agentRunService = {
      createRun: (input: any) => {
        calls.push(['create', input]);
        return {
          id: 'agent-run-1',
          parentRunId: 'root',
          status: 'queued',
          artifacts: [],
          errors: [],
          ...input,
        };
      },
      startRun: (id: string) => calls.push(['start', id]),
      completeRun: (id: string, artifacts: any[]) => calls.push(['complete', id, artifacts]),
    };
    const service = buildService({ agentRunService });
    (service as any).agent = {
      streamEvents: async function* () {
        yield {
          event: 'on_chat_model_end',
          data: {
            output: {
              kwargs: {
                tool_calls: [{
                  id: 'call_1',
                  type: 'tool_call',
                  name: 'task',
                  args: {
                    subagent_type: 'architect',
                    description: 'Inspect runtime orchestration boundaries',
                  },
                }],
              },
            },
          },
        };
        yield {
          event: 'on_tool_start',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: { input: {} },
        };
        yield {
          event: 'on_tool_end',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: { output: 'Runtime boundaries are clear.' },
        };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    for await (const _chunk of service.chat('run it')) {
      void _chunk;
    }

    assert.equal(calls[0][1].agentName, 'architect');
    assert.equal(calls[0][1].task, 'Inspect runtime orchestration boundaries');
    assert.match(calls[2][2][0].content, /Runtime boundaries are clear/);
  });

  test('hydrates delegated task runs from pending legacy OpenAI tool call arguments', async () => {
    const calls: any[] = [];
    const agentRunService = {
      createRun: (input: any) => {
        calls.push(['create', input]);
        return {
          id: 'agent-run-1',
          parentRunId: 'root',
          status: 'queued',
          artifacts: [],
          errors: [],
          ...input,
        };
      },
      startRun: (id: string) => calls.push(['start', id]),
      completeRun: (id: string, artifacts: any[]) => calls.push(['complete', id, artifacts]),
    };
    const service = buildService({ agentRunService });
    (service as any).agent = {
      streamEvents: async function* () {
        yield {
          event: 'on_chat_model_end',
          data: {
            output: {
              additional_kwargs: {
                tool_calls: [{
                  type: 'function',
                  function: {
                    name: 'task',
                    arguments: JSON.stringify({
                      subagent_type: 'reviewer',
                      description: 'Review fallback compatibility',
                    }),
                  },
                }],
              },
            },
          },
        };
        yield {
          event: 'on_tool_start',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: { input: {} },
        };
        yield {
          event: 'on_tool_end',
          name: 'task',
          run_id: 'task-tool-run-1',
          data: { output: 'Test coverage is acceptable.' },
        };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    assert.match(chunks.join(''), /agent reviewer/);
    assert.equal(calls[0][1].agentName, 'reviewer');
    assert.equal(calls[0][1].task, 'Review fallback compatibility');
    assert.match(calls[2][2][0].content, /Test coverage is acceptable/);
  });

  test('tool start output uses readable labels for skill discovery tools', () => {
    const service = buildService();

    assert.match(
      (service as any).formatToolStart('list_skills', {}),
      /list skills/,
    );
    assert.match(
      (service as any).formatToolStart('read_skill', { name: 'planning' }),
      /planning/,
    );
    assert.match(
      (service as any).formatToolStart('list_agents', {}),
      /list agents/,
    );
    assert.match(
      (service as any).formatToolStart('cast_command', { command: '/up' }),
      /\/up/,
    );
  });

  test('tool end output keeps Cast command results compact in the UI', () => {
    const service = buildService();

    const output = (service as any).formatToolEnd(
      'cast_command',
      'Cast command finished: /pr main\n\nOutput:\n! No commits found between feat/cast-platform and main',
    );

    assert.match(output, /output returned to Cast/i);
    assert.doesNotMatch(output, /No commits found/);
    assert.doesNotMatch(output, /executed/i);
  });

  test('drops raw runtime control objects from assistant output', async () => {
    const service = buildService();
    (service as any).agent = {
      streamEvents: async function* () {
        yield {
          event: 'on_chat_model_stream',
          data: {
            chunk: {
              content: '{"lg_name":"Command","lc_kwargs":{"update":"internal"},"langchain_core":"messages"}',
            },
          },
        };
        yield { event: 'on_chat_model_stream', data: { chunk: { content: 'Human text.' } } };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    const output = chunks.join('');
    assert.match(output, /Human text/);
    assert.doesNotMatch(output, /lg_name|lc_kwargs|langchain_core/);
  });

  test('sanitizes raw framework metadata from tool output rendering', async () => {
    const service = buildService();
    (service as any).agent = {
      streamEvents: async function* () {
        yield {
          event: 'on_tool_start',
          name: 'shell',
          run_id: 'tool-1',
          data: { input: { command: 'echo ok' } },
        };
        yield {
          event: 'on_tool_end',
          name: 'shell',
          run_id: 'tool-1',
          data: {
            output: {
              lg_name: 'Command',
              lc_kwargs: { update: 'internal' },
              constructor: { name: 'Command' },
            },
          },
        };
        yield { event: 'on_chat_model_stream', data: { chunk: { content: 'Done.' } } };
      },
    };
    (service as any).cachedBasePrompt = 'base';
    (service as any).cachedSystemPrompt = (service as any).buildContextualPrompt('run it', false);

    const chunks: string[] = [];
    for await (const chunk of service.chat('run it')) {
      chunks.push(chunk);
    }

    const output = chunks.join('');
    assert.match(output, /Done/);
    assert.doesNotMatch(output, /lg_name|lc_kwargs|Command/);
  });
});
