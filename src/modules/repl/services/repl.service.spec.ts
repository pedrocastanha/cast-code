import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ReplService } from './repl.service';
import { stripAnsi, visibleWidth } from '../../../ui/cast-design/cli-renderer';

const buildReplService = (overrides: Record<string, any> = {}) => {
  const defaults = {
    deepAgent: {
      initialize: async () => ({ toolCount: 0, projectPath: '' }),
      reinitializeModel: async () => {},
      getTokenCount: () => 0,
      getMessageCount: () => 0,
      getSessionTokenUsage: () => ({ input: 0, output: 0, cachedInput: 0 }),
      getLastInteractionTokens: () => ({ input: 0, output: 0, cachedInput: 0 }),
      setLocalSessionId: () => {},
    },
    configService: {
      getProvider: () => 'openai',
      getModel: () => 'gpt-4.1-mini',
    },
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
    platformCommands: { cmdLink: async () => false },
    benchmarkCommands: { handleBenchmarkCommand: async () => {} },
    discoveryTools: { setCastCommandHandler: () => {} },
    localSessionStore: undefined,
    environmentCommands: undefined,
    scheduleCommands: undefined,
    sandboxCommands: { cmdSandbox: async () => {} },
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
    deps.platformCommands as any,
    deps.benchmarkCommands as any,
    deps.discoveryTools as any,
    deps.localSessionStore as any,
    deps.environmentCommands as any,
    deps.scheduleCommands as any,
    deps.sandboxCommands as any,
  );
};

const captureStdoutAsync = async <T>(run: (writes: string[]) => Promise<T>): Promise<{ result: T; output: string }> => {
  const originalWrite = process.stdout.write;
  const writes: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    const result = await run(writes);
    return { result, output: writes.join('') };
  } finally {
    process.stdout.write = originalWrite;
  }
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

  test('filters command suggestions and exposes the /link option', () => {
    const service = buildReplService();
    const suggestions = (service as any).getCommandSuggestions('/li');

    assert.deepStrictEqual(
      suggestions.map((s: { text: string }) => s.text),
      ['/link'],
      'only the /link command starts with /li',
    );
  });

  test('filters command suggestions and exposes the /benchmark option', () => {
    const service = buildReplService();
    const suggestions = (service as any).getCommandSuggestions('/bench');

    assert.deepStrictEqual(
      suggestions.map((s: { text: string }) => s.text),
      ['/benchmark'],
      'only the /benchmark command starts with /bench',
    );
  });

  test('filters command suggestions and exposes the /sandbox option', () => {
    const service = buildReplService();
    const suggestions = (service as any).getCommandSuggestions('/sand');

    assert.deepStrictEqual(
      suggestions.map((s: { text: string }) => s.text),
      ['/sandbox'],
      'only the /sandbox command starts with /sand',
    );
  });

  test('routes the /sandbox command to SandboxCommandsService', async () => {
    const recorded: string[][] = [];
    const service = buildReplService({
      sandboxCommands: {
        cmdSandbox: async (args: string[]) => {
          recorded.push(args);
        },
      },
    });

    await (service as any).handleCommand('/sandbox rollback run-1');

    assert.deepStrictEqual(recorded, [['rollback', 'run-1']]);
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

  test('agent-triggered Cast command asks permission before routing to slash command', async () => {
    const runGitCalls: string[] = [];
    const choices: string[] = [];
    const service = buildReplService({
      gitCommands: {
        runGit: (command: string) => { runGitCalls.push(command); },
        cmdPr: async () => {},
        cmdUnitTest: async () => {},
        cmdReview: async () => {},
        cmdFix: async () => {},
        cmdIdent: async () => {},
      },
    });
    (service as any).smartInput = {
      refresh: () => {},
      pause: () => {},
      resume: () => {},
      askChoice: async (message: string) => {
        choices.push(message);
        return 'y';
      },
    };

    const { result } = await captureStdoutAsync<string>(() =>
      (service as any).handleAgentCastCommand('/status'),
    );

    assert.match(result, /finished/i);
    assert.deepEqual(choices, ['Run this Cast command?']);
    assert.deepEqual(runGitCalls, ['git status']);
  });

  test('agent-triggered Cast command returns the command output to the agent', async () => {
    const service = buildReplService({
      gitCommands: {
        runGit: () => {},
        cmdPr: async () => {
          process.stdout.write('\r\n  ! No commits found between feat/cast-platform and main\r\n');
        },
        cmdUnitTest: async () => {},
        cmdReview: async () => {},
        cmdFix: async () => {},
        cmdIdent: async () => {},
      },
    });
    (service as any).smartInput = {
      refresh: () => {},
      pause: () => {},
      resume: () => {},
      askChoice: async () => 'y',
      question: async () => '',
    };

    const { result, output } = await captureStdoutAsync<string>(() =>
      (service as any).handleAgentCastCommand('/pr main'),
    );
    const visibleOutput = stripAnsi(output).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    assert.match(result, /Cast command finished: \/pr main/);
    assert.match(result, /No commits found between feat\/cast-platform and main/);
    assert.doesNotMatch(visibleOutput, /Running \/pr main\n\s*\n/);
  });

  test('starts and ends local state session best-effort', async () => {
    const calls: any[] = [];
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '/repo' }),
        reinitializeModel: async () => {},
        getTokenCount: () => 77,
        getMessageCount: () => 0,
        getSessionTokenUsage: () => ({ input: 0, output: 0, cachedInput: 0 }),
        getLastInteractionTokens: () => ({ input: 0, output: 0, cachedInput: 0 }),
        setLocalSessionId: () => {},
      },
      platformService: {
        track: () => {},
        close: async () => { calls.push(['platform-close']); },
        getStatus: () => 'online',
        getProject: () => ({ id: 'project-1' }),
      },
      localSessionStore: {
        startSession: async (input: any) => {
          calls.push(['start', input]);
          return { id: 'local-session-1' };
        },
        endSession: async (id: string, summary: any) => {
          calls.push(['end', id, summary]);
        },
      },
    });

    await (service as any).startLocalStateSession({ projectPath: '/repo' });
    await service.shutdown();

    assert.deepEqual(calls, [
      ['start', {
        projectRoot: '/repo',
        platformProjectId: 'project-1',
        model: 'openai/gpt-4.1-mini',
      }],
      ['platform-close'],
      ['end', 'local-session-1', { totalTokens: 77 }],
    ]);
  });

  test('warns once and keeps running when local state session start fails', async () => {
    const service = buildReplService({
      localSessionStore: {
        startSession: async () => {
          throw new Error('state unavailable');
        },
      },
    });

    const { output } = await captureStdoutAsync(async () => {
      await (service as any).startLocalStateSession({ projectPath: '/repo' });
      await (service as any).startLocalStateSession({ projectPath: '/repo' });
    });

    assert.match(output, /Local state disabled/i);
    assert.equal((output.match(/Local state disabled/gi) ?? []).length, 1);
  });

  test('ends local state session even when platform close fails', async () => {
    const calls: string[] = [];
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '/repo' }),
        reinitializeModel: async () => {},
        getTokenCount: () => 77,
        getMessageCount: () => 0,
        getSessionTokenUsage: () => ({ input: 0, output: 0, cachedInput: 0 }),
        getLastInteractionTokens: () => ({ input: 0, output: 0, cachedInput: 0 }),
        setLocalSessionId: () => {},
      },
      platformService: {
        track: () => {},
        close: async () => {
          calls.push('platform-close');
          throw new Error('platform close failed');
        },
        getStatus: () => 'online',
        getProject: () => ({ id: 'project-1' }),
      },
      localSessionStore: {
        startSession: async () => ({ id: 'local-session-1' }),
        endSession: async () => {
          calls.push('local-end');
        },
      },
    });

    await (service as any).startLocalStateSession({ projectPath: '/repo' });
    await assert.rejects(() => service.shutdown(), /platform close failed/);

    assert.deepEqual(calls, ['platform-close', 'local-end']);
  });

  test('agent-triggered Cast command renders a permission panel with command context', async () => {
    const choicePrompts: string[] = [];
    const service = buildReplService();

    (service as any).smartInput = {
      refresh: () => {},
      pause: () => {},
      resume: () => {},
      askChoice: async (message: string) => {
        choicePrompts.push(message);
        return 'n';
      },
    };

    const { output } = await captureStdoutAsync(() =>
      (service as any).handleAgentCastCommand('/up'),
    );

    const visibleOutput = stripAnsi(output);
    assert.match(visibleOutput, /Cast command\s+\/up/);
    assert.match(visibleOutput, /Action\s+Commit and push current changes/);
    assert.match(visibleOutput, /Approval\s+required/);
    assert.doesNotMatch(visibleOutput.replace(/\r\n/g, '\n'), /Approval[^\n]*\n\s*\n/);
    assert.deepEqual(choicePrompts, ['Run this Cast command?']);
  });

  test('agent-triggered Cast command does not redraw the prompt while agent output continues', async () => {
    let resumeCalls = 0;
    const service = buildReplService();
    (service as any).isProcessing = true;
    (service as any).smartInput = {
      refresh: () => {},
      pause: () => {},
      resume: () => { resumeCalls += 1; },
      askChoice: async () => 'n',
    };

    await captureStdoutAsync(() =>
      (service as any).handleAgentCastCommand('/status'),
    );

    assert.equal(resumeCalls, 0);
  });

  test('agent-triggered Cast command denial does not route the slash command', async () => {
    const runGitCalls: string[] = [];
    const service = buildReplService({
      gitCommands: {
        runGit: (command: string) => { runGitCalls.push(command); },
        cmdPr: async () => {},
        cmdUnitTest: async () => {},
        cmdReview: async () => {},
        cmdFix: async () => {},
        cmdIdent: async () => {},
      },
    });
    (service as any).smartInput = {
      refresh: () => {},
      pause: () => {},
      resume: () => {},
      askChoice: async () => 'n',
    };

    const { result } = await captureStdoutAsync<string>(() =>
      (service as any).handleAgentCastCommand('/status'),
    );

    assert.match(result, /denied/i);
    assert.deepEqual(runGitCalls, []);
  });

  test('registers the agent Cast command handler during startup', async () => {
    let registeredHandler: ((command: string) => Promise<string>) | null = null;
    const service = buildReplService({
      discoveryTools: {
        setCastCommandHandler: (handler: (command: string) => Promise<string>) => {
          registeredHandler = handler;
        },
      },
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getSessionTokenUsage: () => ({ input: 0, output: 0, cachedInput: 0 }),
      },
      agentRegistry: { resolveAllAgents: () => [] },
      remoteServer: { onMessage: () => {} },
      permissionService: { setPermissionHandler: () => {} },
      filesystemTools: { setFileWriteHandler: () => {} },
    });

    const originalWrite = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await service.start();
      assert(registeredHandler);
    } finally {
      service.stop();
      process.stdin.pause();
      process.stdout.write = originalWrite;
    }
  });

  test('routes /link to platformCommands and refreshes the agent after a link', async () => {
    const recordedArgs: string[][] = [];
    const smartInputStub = { showPrompt: () => {} };
    let initializeCalls = 0;
    const service = buildReplService({
      deepAgent: {
        initialize: async () => {
          initializeCalls += 1;
          return { toolCount: 0, projectPath: '' };
        },
        reinitializeModel: async () => {},
        getTokenCount: () => 0,
        getMessageCount: () => 0,
      },
      platformCommands: {
        cmdLink: async (args: string[], input: unknown) => {
          recordedArgs.push(args);
          assert.strictEqual(input, smartInputStub);
          return true;
        },
      },
    });
    (service as any).smartInput = smartInputStub;

    await (service as any).handleCommand('/link --project project-1');

    assert.deepStrictEqual(recordedArgs, [['--project', 'project-1']]);
    assert.equal(initializeCalls, 1);
  });

  test('routes /benchmark to benchmark commands with the active smart input', async () => {
    const calls: any[] = [];
    const smartInputStub = { showPrompt: () => {} };
    const service = buildReplService({
      benchmarkCommands: {
        setAgentExecutor: () => {},
        cmdBenchmark: async (args: string[], input: unknown) => {
          calls.push([args, input]);
        },
      },
    });
    (service as any).smartInput = smartInputStub;

    await (service as any).handleCommand('/benchmark list');

    assert.deepEqual(calls, [[['list'], smartInputStub]]);
  });

  test('routes /benchmark commands to BenchmarkCommandsService with active smart input', async () => {
    const calls: Array<{ args: string[]; input: unknown }> = [];
    const smartInputStub = { showPrompt: () => {} };
    const service = buildReplService({
      benchmarkCommands: {
        handleBenchmarkCommand: async (args: string[], input: unknown) => {
          calls.push({ args, input });
        },
      },
    });
    (service as any).smartInput = smartInputStub;

    await (service as any).handleCommand('/benchmark run def-1');

    assert.deepEqual(calls, [{ args: ['run', 'def-1'], input: smartInputStub }]);
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

  test('input footer exposes input, cached input, output, effort, and model', () => {
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getSessionTokenUsage: () => ({ input: 20_000, output: 4_000, cachedInput: 6_000 }),
      },
      configService: { getProvider: () => 'openai', getModel: () => 'gpt-4.1-mini' },
      configManager: { getModelConfig: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }) },
    });

    const lines = (service as any).getInputFooterLines();
    const combined = stripAnsi(lines.join(' '));

    assert(lines.length >= 2, 'footer should render a divider and telemetry lines');
    assert.match(combined, /tokens/i);
    assert.match(combined, /in 20k \[6k cached\]/i);
    assert.match(combined, /out 4k/i);
    assert.match(combined, /effort/i);
    assert.match(combined, /balanced/i);
    assert.match(combined, /model/i);
    assert.match(combined, /gpt-4\.1-mini/);
  });

  test('input footer includes estimated session cost when available', () => {
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getSessionTokenUsage: () => ({ input: 20_000, output: 4_000, cachedInput: 6_000 }),
      },
      statsCommandsService: {
        setDefaultModel: () => {},
        cmdStats: () => {},
        getSessionCostLabel: () => '$0.01',
      },
    });

    const combined = stripAnsi((service as any).getInputFooterLines().join(' '));

    assert.match(combined, /cost \$0\.01/i);
  });

  test('input footer wraps telemetry at separators on narrow terminals', () => {
    const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', { configurable: true, value: 56 });

    try {
      const service = buildReplService({
        deepAgent: {
          initialize: async () => ({ toolCount: 0, projectPath: '' }),
          reinitializeModel: async () => {},
          getSessionTokenUsage: () => ({ input: 9300, output: 1200, cachedInput: 8000 }),
        },
        configService: { getProvider: () => 'openai', getModel: () => 'gpt-4.1-mini' },
        configManager: { getModelConfig: () => undefined },
      });
      (service as any).isProcessing = true;
      (service as any).spinnerLabel = 'Thinking';
      (service as any).pendingLines = ['queued prompt'];

      const lines = (service as any).getInputFooterLines();

      assert(lines.length > 2, 'narrow footer should split into multiple telemetry rows');
      assert(
        lines.every((line: string) => visibleWidth(line) <= 56),
        `footer lines should fit terminal width: ${lines.join(' | ')}`,
      );
      const combined = stripAnsi(lines.join(' '));
      assert.match(combined, /queue/i);
      assert.match(combined, /thinking/i);
      assert.match(combined, /cached/i);
    } finally {
      if (originalColumns) {
        Object.defineProperty(process.stdout, 'columns', originalColumns);
      }
    }
  });

  test('handleMessage batches tiny response chunks in an external output block', async () => {
    const writes: string[] = [];
    const outputLines: string[] = [];
    let beginExternalOutputCalls = 0;
    let endExternalOutputCalls = 0;
    const originalWrite = process.stdout.write;
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getSessionTokenUsage: () => ({ input: 0, output: 0, cachedInput: 0 }),
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

    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      }) as typeof process.stdout.write;

      (service as any).smartInput = {
        refresh: () => {},
        beginExternalOutput: () => { beginExternalOutputCalls += 1; },
        endExternalOutput: () => { endExternalOutputCalls += 1; },
        printExternal: (value: string) => writes.push(value),
        writeOutputLine: (value: string) => outputLines.push(value),
      };

      await (service as any).handleMessage('oi');

      assert(!writes.includes('O'), 'single-character text chunks should not be printed independently');
      assert(!writes.includes('l'), 'single-character text chunks should not be printed independently');
      assert.match(writes.join(''), /Olá! Como posso ajudar\?/);
      assert.equal(beginExternalOutputCalls, 1, 'response text should enter an external output block once');
      assert.equal(endExternalOutputCalls, 1, 'response text should leave the external output block once');
      assert.equal(outputLines.length, 1, 'a separator should be written after the response block');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  test('handleMessage keeps final assistant text outside the prompt after a Cast command tool', async () => {
    const events: string[] = [];
    const outputLines: string[] = [];
    const originalWrite = process.stdout.write;
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getSessionTokenUsage: () => ({ input: 0, output: 0, cachedInput: 0 }),
        chat: async function* () {
          yield '\n\x1b[2m  ▶ \x1b[0m\x1b[2m\x1b[38;5;45mcast command\x1b[0m\x1b[2m /up\x1b[0m\n';
          yield '\x1b[2m    \x1b[32m✓\x1b[0m\x1b[2m Cast command executed: /up\x1b[0m\n';
          yield 'Realizei o comando /up.';
        },
      },
      mentionsService: {
        processMessage: async (message: string) => ({ expandedMessage: message, mentions: [] }),
        getMentionsSummary: () => [],
      },
      planMode: { shouldEnterPlanMode: async () => ({ shouldPlan: false }) },
    });

    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        events.push(`stdout:${stripAnsi(String(chunk))}`);
        return true;
      }) as typeof process.stdout.write;

      (service as any).smartInput = {
        refresh: () => {},
        beginExternalOutput: () => { events.push('begin'); },
        endExternalOutput: () => { events.push('end'); },
        printExternal: (value: string) => events.push(`print:${stripAnsi(value)}`),
        writeOutputLine: (value: string) => outputLines.push(value),
      };

      await (service as any).handleMessage('man, vc pode usar o /up?');

      const toolPrintIndex = events.findIndex((event) => event.startsWith('print:') && event.includes('▶ cast command /up'));
      const beginIndex = events.indexOf('begin');
      const finalTextIndex = events.findIndex((event) => event.startsWith('stdout:') && event.includes('Realizei o comando /up.'));
      const castHeaderPrint = events.find((event) => event.startsWith('print:') && /^\s*print:\s*Cast\s*$/m.test(event));

      assert(toolPrintIndex >= 0, 'tool start should render as tool output before assistant text mode');
      assert(beginIndex > toolPrintIndex, 'assistant text mode should begin after tool output');
      assert(finalTextIndex > beginIndex, 'final assistant response should be written inside external output mode');
      assert.equal(castHeaderPrint, undefined, 'assistant header should not be printed through prompt rendering');
      assert.equal(outputLines.length, 1, 'one final separator should be written after the response block');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  test('handleMessage keeps post-tool text outside the prompt after earlier assistant text', async () => {
    const events: string[] = [];
    const originalWrite = process.stdout.write;
    const service = buildReplService({
      deepAgent: {
        initialize: async () => ({ toolCount: 0, projectPath: '' }),
        reinitializeModel: async () => {},
        getSessionTokenUsage: () => ({ input: 0, output: 0, cachedInput: 0 }),
        chat: async function* () {
          yield 'Vou rodar o comando.';
          yield '\n\x1b[2m  ▶ \x1b[0m\x1b[2m\x1b[38;5;45mcast command\x1b[0m\x1b[2m /pr main\x1b[0m\n';
          yield '\x1b[2m    \x1b[32m✓\x1b[0m\x1b[2m Output returned to Cast\x1b[0m\n';
          yield 'Nao criei a PR porque nao havia commits.';
        },
      },
      mentionsService: {
        processMessage: async (message: string) => ({ expandedMessage: message, mentions: [] }),
        getMentionsSummary: () => [],
      },
      planMode: { shouldEnterPlanMode: async () => ({ shouldPlan: false }) },
    });

    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        events.push(`stdout:${stripAnsi(String(chunk))}`);
        return true;
      }) as typeof process.stdout.write;

      (service as any).smartInput = {
        refresh: () => {},
        beginExternalOutput: () => { events.push('begin'); },
        endExternalOutput: () => { events.push('end'); },
        printExternal: (value: string) => events.push(`print:${stripAnsi(value)}`),
        writeOutputLine: () => {},
      };

      await (service as any).handleMessage('usa /pr main');

      const finalPrint = events.find((event) => event.startsWith('print:') && event.includes('Nao criei a PR'));
      const finalStdout = events.find((event) => event.startsWith('stdout:') && event.includes('Nao criei a PR'));

      assert.equal(finalPrint, undefined, 'post-tool assistant text should not be rendered through prompt printExternal');
      assert(finalStdout, 'post-tool assistant text should be written in external output mode');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  test('file write prompt treats cancellation as denied', async () => {
    const originalWrite = process.stdout.write;
    const writes: string[] = [];
    const service = buildReplService({
      filesystemTools: {
        setFileWriteHandler: () => {},
      },
    });

    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      }) as typeof process.stdout.write;

      (service as any).smartInput = {
        refresh: () => {},
        pause: () => {},
        resume: () => {},
        askChoice: async (message: string) => {
          assert.equal(message, 'Apply this change?');
          return '';
        },
      };

      const allowed = await (service as any).handleFileWritePrompt(
        '/tmp/cast-write-target.txt',
        '',
        true,
      );

      assert.equal(allowed, false);
      assert.match(writes.join(''), /Create/);
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  test('interactive plan mode asks generated clarifying questions before approval', async () => {
    const originalWrite = process.stdout.write;
    const writes: string[] = [];
    const questions: string[] = [];
    let clarifyingCalls = 0;

    const service = buildReplService({
      planMode: {
        gatherProjectContext: async () => 'Project files: src/a.ts',
        generatePlan: async () => ({
          title: 'Plan title',
          overview: 'Plan overview',
          complexity: 'medium',
          shouldPlan: true,
          steps: [
            { id: 1, description: 'Update behavior', files: ['src/a.ts'] },
          ],
        }),
        generateClarifyingQuestions: async () => {
          clarifyingCalls += 1;
          return ['Should this keep backward compatibility?'];
        },
        formatPlanForDisplay: () => 'formatted plan\n',
      },
    });

    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      }) as typeof process.stdout.write;

      (service as any).smartInput = {
        askChoice: async () => 'a',
        question: async (question: string) => {
          questions.push(stripAnsi(question));
          return 'Yes, keep it compatible.';
        },
      };

      const prompt = await (service as any).runInteractivePlanMode('Improve plan mode');

      assert.equal(clarifyingCalls, 1);
      assert.deepEqual(questions, ['Should this keep backward compatibility? ']);
      assert.match(prompt, /User clarifications:/);
      assert.match(prompt, /Should this keep backward compatibility\? Yes, keep it compatible\./);
      assert.match(writes.join(''), /PLAN MODE/);
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
