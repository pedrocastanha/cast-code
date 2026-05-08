import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';

import { DeepAgentService } from './deep-agent.service';
import { EFFORT_PROFILES } from '../../config/types/config.types';

const buildService = (overrides: Record<string, any> = {}) => {
  const deps = {
    multiLlmService: {
      getCurrentEffortProfile: () => EFFORT_PROFILES.balanced,
    },
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
    markdownRenderer: {},
    permissionService: {},
    snapshotService: {},
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
    ...overrides,
  };

  return new DeepAgentService(
    deps.multiLlmService as any,
    deps.agentRegistry as any,
    deps.toolsRegistry as any,
    deps.mcpRegistry as any,
    deps.projectLoader as any,
    deps.projectContext as any,
    deps.skillRegistry as any,
    deps.memoryService as any,
    deps.markdownRenderer as any,
    deps.permissionService as any,
    deps.snapshotService as any,
    deps.statsService as any,
    deps.replayService as any,
    deps.i18nService as any,
    deps.fileWatcherService as any,
    deps.promptLoader as any,
    deps.promptClassifier as any,
    deps.platformService as any,
  );
};

describe('DeepAgentService compact chat route', () => {
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
});

describe('DeepAgentService system prompt engineering workflow', () => {
  test('requires adaptive clarification and test-first implementation for code changes', () => {
    const service = buildService();

    const prompt = (service as any).buildSystemPrompt('', '', [], [], [], [], '');

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
});
