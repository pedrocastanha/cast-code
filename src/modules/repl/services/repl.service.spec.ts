import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ReplService } from './repl.service';

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
  };

  const deps = { ...defaults, ...overrides };

  return new ReplService(
    deps.deepAgent,
    deps.configService,
    deps.configManager,
    deps.mentionsService,
    deps.mcpRegistry,
    deps.agentRegistry,
    deps.skillRegistry,
    deps.welcomeScreen,
    deps.planMode,
    deps.replCommands,
    deps.gitCommands,
    deps.agentCommands,
    deps.mcpCommands,
    deps.configCommands,
    deps.projectCommands,
    deps.snapshotCommandsService,
    deps.statsCommandsService,
    deps.replayCommandsService,
    deps.vaultCommandsService,
    deps.toolsRegistry,
    deps.kanbanServer,
    deps.remoteServer,
    deps.permissionService,
    deps.filesystemTools,
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

      capturedCallback!();
      capturedCallback!();

      assert.strictEqual(refreshCalls, 3, 'spinner should refresh once on start and once per tick');
      assert.strictEqual((service as any).spinnerFrameIndex, 2, 'spinner frame should advance on each tick');
    } finally {
      (global as any).setInterval = originalSetInterval;
      (global as any).clearInterval = originalClearInterval;
    }
  });

  test('input footer exposes tokens, context, model, and agent readiness', () => {
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getTokenCount: () => 3200,
        getMessageCount: () => 12,
      },
      configService: { getProvider: () => 'openai', getModel: () => 'gpt-4.1-mini' },
      configManager: { getModelConfig: () => undefined },
      agentRegistry: { resolveAllAgents: () => [{}, {}, {}] },
    });

    const lines = (service as any).getInputFooterLines();
    const combined = lines.join(' ');

    assert.equal(lines.length, 2, 'footer should render a divider and one telemetry line');
    assert.match(combined, /tokens/i);
    assert.match(combined, /ctx/i);
    assert.match(combined, /model/i);
    assert.match(combined, /agents/i);
    assert.match(combined, /3/);
  });
});
