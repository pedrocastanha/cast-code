import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ReplService } from './repl.service';
import { Colors } from '../utils/theme';

const buildReplService = (overrides: Record<string, any> = {}) => {
  const defaults = {
    deepAgent: {
      initialize: async () => ({ toolCount: 0, projectPath: '' }),
      reinitializeModel: async () => {},
    },
    configService: {},
    configManager: { loadConfig: async () => {} },
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
      cmdModel: () => {},
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
    toolsRegistry: {},
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
    deps.toolsRegistry,
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

  // Confirms spinner output rotates icons and extends dot sequences on each interval tick.
  test('startSpinner writes updated label and dot count on each tick', () => {
    const service = buildReplService();
    const writes: string[] = [];
    const originalStdout = process.stdout.write;
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    const fakeTimer = Symbol('spinner-timer');
    let capturedCallback: (() => void) | null = null;

    try {
      (process.stdout as any).write = (chunk: string) => {
        writes.push(String(chunk));
        return true;
      };

      (global as any).setInterval = (callback: () => void) => {
        capturedCallback = callback;
        return fakeTimer as unknown as NodeJS.Timer;
      };

      (global as any).clearInterval = () => {};

      (service as any).startSpinner('testing');
      assert(capturedCallback, 'spinner setInterval callback should be captured');

      capturedCallback!();
      capturedCallback!();

      assert.strictEqual(writes.length, 2, 'spinner should have written twice after two ticks');
      assert(writes[0].startsWith('\r' + Colors.cyan), 'spinner output should start with the cyan color code');
      assert(writes[0].includes(`${Colors.dim}testing.${Colors.reset}`), 'first tick should append a single dot');
      assert(writes[1].includes(`${Colors.dim}testing..${Colors.reset}`), 'second tick should append two dots');
      assert.notStrictEqual(writes[0], writes[1], 'consecutive spinner ticks should produce different output');
    } finally {
      (process.stdout as any).write = originalStdout;
      (global as any).setInterval = originalSetInterval;
      (global as any).clearInterval = originalClearInterval;
    }
  });
});
