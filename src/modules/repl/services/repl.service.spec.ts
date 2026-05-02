import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ReplService } from './repl.service';
import { visibleWidth } from '../../../ui/cast-design/cli-renderer';

const buildReplService = (overrides: Record<string, any> = {}) => {
  const defaults = {
    deepAgent: {
      initialize: async () => ({ toolCount: 0, projectPath: '' }),
      reinitializeModel: async () => {},
      getTokenCount: () => 0,
      getMessageCount: () => 0,
    },
    configService: {},
    configManager: { loadConfig: async () => {}, getModelConfig: () => undefined },
    mentionsService: {},
    mcpRegistry: {},
    agentRegistry: { resolveAllAgents: () => [] },
    skillRegistry: {},
    welcomeScreen: { printWelcomeScreen: () => {} },
    planMode: {},
    replCommands: {
      printHelp: () => {},
      cmdClear: () => {},
      cmdContext: () => {},
      cmdModel: async () => false,
      cmdEffort: async () => false,
      cmdMentionsHelp: () => {},
    },
    gitCommands: {
      runGit: () => {},
      cmdPr: async () => {},
      cmdUnitTest: async () => {},
      cmdReview: async () => {},
      cmdFix: async () => {},
      cmdIdent: async () => {},
    },
    agentCommands: {},
    mcpCommands: {},
    configCommands: { handleConfigCommand: async () => {} },
    projectCommands: { cmdProject: async () => {} },
    snapshotCommandsService: {},
    statsCommandsService: { setDefaultModel: () => {}, cmdStats: () => {} },
    replayCommandsService: { cmdReplay: () => {} },
    vaultCommandsService: { cmdVault: () => {} },
    toolsRegistry: {},
    kanbanServer: {},
    remoteServer: { onMessage: () => {} },
    permissionService: { setPermissionHandler: () => {} },
    filesystemTools: { setFileWriteHandler: () => {} },
    platformService: {
      track: () => {},
      close: async () => {},
      getStatus: () => 'disabled',
    },
  };

  const deps = { ...defaults, ...overrides };

  return new ReplService(
    deps.deepAgent as any,
    deps.configService as any,
    deps.configManager as any,
    deps.mentionsService as any,
    deps.mcpRegistry as any,
    deps.agentRegistry as any,
    deps.skillRegistry as any,
    deps.welcomeScreen as any,
    deps.planMode as any,
    deps.replCommands as any,
    deps.gitCommands as any,
    deps.agentCommands as any,
    deps.mcpCommands as any,
    deps.configCommands as any,
    deps.projectCommands as any,
    deps.snapshotCommandsService as any,
    deps.statsCommandsService as any,
    deps.replayCommandsService as any,
    deps.vaultCommandsService as any,
    deps.toolsRegistry as any,
    deps.kanbanServer as any,
    deps.remoteServer as any,
    deps.permissionService as any,
    deps.filesystemTools as any,
    deps.platformService as any,
  );
};

describe('ReplService', () => {
  // Ensures command suggestions honor filtering and include the recently added /unit-test command.
  test('filters command suggestions and exposes the /unit-test option', () => {
    const service = buildReplService();
    const suggestions = (service as any).getCommandSuggestions('/unit');

    assert(Array.isArray(suggestions), 'command suggestions should be an array');
    const texts = suggestions.map((s: { text: string }) => s.text);
    assert.deepStrictEqual(texts, ['/unit-test'], 'only the /unit-test command starts with /unit');
  });

  test('filters command suggestions and exposes the /effort option', () => {
    const service = buildReplService();
    const suggestions = (service as any).getCommandSuggestions('/eff');

    assert.deepStrictEqual(
      suggestions.map((s: { text: string }) => s.text),
      ['/effort'],
      'only the /effort command starts with /eff',
    );
  });

  // Verifies the /unit-test command routes to gitCommands.cmdUnitTest with the active smart input.
  test('routes the /unit-test command to gitCommands.cmdUnitTest', async () => {
    const recorded: Array<unknown> = [];
    const gitCommands = {
      runGit: () => {},
      cmdPr: async () => {},
      cmdUnitTest: async (input: unknown) => recorded.push(input),
      cmdReview: async () => {},
      cmdFix: async () => {},
      cmdIdent: async () => {},
    };

    const service = buildReplService({ gitCommands });
    const smartInputStub = { showPrompt: () => {} };
    (service as any).smartInput = smartInputStub;

    await (service as any).handleCommand('/unit-test');

    assert.strictEqual(recorded.length, 1, 'cmdUnitTest should be invoked exactly once');
    assert.strictEqual(recorded[0], smartInputStub, 'cmdUnitTest receives the current smart input instance');
  });

  test('tracks slash commands without command arguments', async () => {
    const tracked: Array<Record<string, unknown>> = [];
    const service = buildReplService({
      platformService: {
        track: (type: string, payload: Record<string, unknown>) => tracked.push({ type, ...payload }),
        close: async () => {},
        getStatus: () => 'disabled',
      },
    });
    (service as any).smartInput = { showPrompt: () => {} };

    await (service as any).handleCommand('/help verbose');

    assert.deepEqual(tracked, [{ type: 'command.run', command: '/help' }]);
  });

  test('reinitializes the active model after /model changes configuration', async () => {
    let reinitializeCalls = 0;
    let statsModel: string | null = null;
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => { reinitializeCalls += 1; },
        getTokenCount: () => 0,
        getMessageCount: () => 0,
      },
      configService: { getProvider: () => 'openai', getModel: () => 'gpt-4.1-mini' },
      configManager: {
        loadConfig: async () => {},
        getModelConfig: () => ({ provider: 'openai', model: 'gpt-5.4-mini' }),
      },
      replCommands: {
        printHelp: () => {},
        cmdClear: () => {},
        cmdContext: () => {},
        cmdModel: async () => true,
        cmdEffort: async () => false,
        cmdMentionsHelp: () => {},
      },
      statsCommandsService: {
        setDefaultModel: (value: string) => { statsModel = value; },
        cmdStats: () => {},
      },
    });

    (service as any).smartInput = { showPrompt: () => {} };

    await (service as any).handleCommand('/model');

    assert.strictEqual(reinitializeCalls, 1, 'model changes should reinitialize the active model once');
    assert.strictEqual(statsModel, 'openai/gpt-5.4-mini', 'stats should refresh to the new model display name');
  });

  test('routes /effort and reinitializes the active model after a change', async () => {
    let reinitializeCalls = 0;
    let statsModel: string | null = null;
    const recordedArgs: string[][] = [];
    const smartInputStub = { showPrompt: () => {} };
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => { reinitializeCalls += 1; },
        getTokenCount: () => 0,
        getMessageCount: () => 0,
      },
      configService: { getProvider: () => 'openai', getModel: () => 'gpt-4.1-mini' },
      configManager: {
        loadConfig: async () => {},
        getModelConfig: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }),
      },
      replCommands: {
        printHelp: () => {},
        cmdClear: () => {},
        cmdContext: () => {},
        cmdModel: async () => false,
        cmdEffort: async (args: string[], input: unknown) => {
          recordedArgs.push(args);
          assert.strictEqual(input, smartInputStub);
          return true;
        },
        cmdMentionsHelp: () => {},
      },
      statsCommandsService: {
        setDefaultModel: (value: string) => { statsModel = value; },
        cmdStats: () => {},
      },
    });

    (service as any).smartInput = smartInputStub;

    await (service as any).handleCommand('/effort deep');

    assert.deepStrictEqual(recordedArgs, [['deep']]);
    assert.strictEqual(reinitializeCalls, 1);
    assert.strictEqual(statsModel, 'openai/gpt-4.1-mini');
  });

  // Confirms spinner output rotates icons and extends dot sequences on each interval tick.
  test('startSpinner updates spinner state and refreshes the input on each tick', () => {
    const service = buildReplService();
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    const fakeTimer = Symbol('spinner-timer');
    let capturedCallback: (() => void) | null = null;
    let refreshCalls = 0;

    try {
      (global as any).setInterval = (callback: () => void) => {
        capturedCallback = callback;
        return fakeTimer as unknown as NodeJS.Timer;
      };

      (global as any).clearInterval = () => {};
      (service as any).smartInput = { refresh: () => { refreshCalls += 1; } };

      (service as any).startSpinner('testing');
      assert(capturedCallback, 'spinner setInterval callback should be captured');
      assert.strictEqual((service as any).spinnerLabel, 'testing');
      assert.strictEqual((service as any).spinnerFrameIndex, 0);

      const callback = capturedCallback as () => void;
      callback();
      callback();

      assert.strictEqual(refreshCalls, 3, 'spinner should refresh once on start and once per tick');
      assert.strictEqual((service as any).spinnerFrameIndex, 2, 'spinner frame should advance on each tick');
    } finally {
      (global as any).setInterval = originalSetInterval;
      (global as any).clearInterval = originalClearInterval;
    }
  });

  test('input footer exposes tokens, context percentage, model, and agent readiness', () => {
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getTokenCount: () => 20_000,
        getMessageCount: () => 12,
      },
      configService: { getProvider: () => 'openai', getModel: () => 'gpt-4.1-mini' },
      configManager: { getModelConfig: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }) },
      agentRegistry: { resolveAllAgents: () => [{}, {}, {}] },
    });

    const lines = (service as any).getInputFooterLines();
    const combined = lines.join(' ');

    assert(lines.length >= 2, 'footer should render a divider and telemetry lines');
    assert.match(combined, /tokens/i);
    assert.match(combined, /ctx/i);
    assert.match(combined, /98\.1%/);
    assert.match(combined, /livre/i);
    assert.match(combined, /model/i);
    assert.match(combined, /agents/i);
    assert.match(combined, /3/);
  });

  test('input footer wraps telemetry at separators on narrow terminals', () => {
    const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 56 });

    try {
      const service = buildReplService({
        deepAgent: {
          initialize: async () => ({ toolCount: 0, projectPath: '' }),
          reinitializeModel: async () => {},
          getTokenCount: () => 9300,
          getMessageCount: () => 42,
        },
        configService: { getProvider: () => 'openai', getModel: () => 'gpt-4.1-mini' },
        configManager: { getModelConfig: () => undefined },
        agentRegistry: { resolveAllAgents: () => [{}, {}, {}, {}, {}, {}, {}] },
        platformService: {
          track: () => {},
          close: async () => {},
          getStatus: () => 'error',
        },
      });

      const lines = (service as any).getInputFooterLines();

      assert(lines.length > 2, 'narrow footer should split into multiple telemetry rows');
      assert(
        lines.every((line: string) => visibleWidth(line) <= 56),
        `footer lines should fit terminal width: ${lines.join(' | ')}`,
      );
      assert.match(lines.join(' '), /endpoint/i);
      assert.match(lines.join(' '), /platform/i);
    } finally {
      if (originalColumns) {
        Object.defineProperty(process.stdout, 'columns', originalColumns);
      }
    }
  });

  test('handleMessage batches tiny response chunks without suspending the prompt', async () => {
    const writes: string[] = [];
    let beginExternalOutputCalls = 0;
    let endExternalOutputCalls = 0;
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getTokenCount: () => 0,
        getMessageCount: () => 0,
        chat: async function* () {
          yield 'O';
          yield 'l';
          yield 'á';
          yield '!';
          yield ' Como';
          yield ' posso';
          yield ' ajudar?';
          yield '\n\x1b[2m  ─ in: 8 | out: 12\x1b[0m\n';
        },
      },
      mentionsService: {
        processMessage: async (message: string) => ({ expandedMessage: message, mentions: [] }),
        getMentionsSummary: () => [],
      },
      planMode: { shouldEnterPlanMode: async () => ({ shouldPlan: false }) },
    });

    (service as any).smartInput = {
      refresh: () => {},
      beginExternalOutput: () => { beginExternalOutputCalls += 1; },
      endExternalOutput: () => { endExternalOutputCalls += 1; },
      printExternal: (value: string) => writes.push(value),
    };

    await (service as any).handleMessage('oi');

    assert(!writes.includes('O'), 'single-character text chunks should not be printed independently');
    assert(!writes.includes('l'), 'single-character text chunks should not be printed independently');
    assert(
      writes.some((value) => value.includes('Olá!')),
      'buffered text should be printed as readable phrases',
    );
    assert.equal(beginExternalOutputCalls, 0, 'response output should keep the prompt editable while streaming');
    assert.equal(endExternalOutputCalls, 0, 'response output should not need to unlock the prompt after streaming');
  });
});
