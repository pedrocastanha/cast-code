import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

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
  test('short greetings stream through the compact model without invoking the deep agent', async () => {
    let deepAgentCalls = 0;
    let trackedUsage: any = null;
    let capturedMessages: any[] = [];

    const service = buildService({
      statsService: {
        trackUsage: (model: string, inputTokens: number, outputTokens: number) => {
          trackedUsage = { model, inputTokens, outputTokens };
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
