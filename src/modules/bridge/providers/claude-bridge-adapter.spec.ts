import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ClaudeBridgeAdapter, CliBridgeAdapter, isBridgeProviderId } from './claude-bridge-adapter';

describe('ClaudeBridgeAdapter', () => {
  test('uses claude as default command', () => {
    const adapter = new ClaudeBridgeAdapter();

    assert.equal(adapter.id, 'claude');
    assert.equal(adapter.label, 'Claude CLI');
    assert.equal(adapter.defaultCommand(), 'claude');
    assert.deepEqual(adapter.defaultArgs(), [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--tools',
      '',
      '--model',
      'sonnet',
    ]);
  });

  test('honors command and args environment overrides', () => {
    const adapter = new ClaudeBridgeAdapter({
      CAST_BRIDGE_CLAUDE_COMMAND: 'node',
      CAST_BRIDGE_CLAUDE_ARGS: 'scripts/fixtures/bridge/fake-claude-cli.mjs --flag',
    } as any);

    assert.equal(adapter.defaultCommand(), 'node');
    assert.deepEqual(adapter.defaultArgs(), ['scripts/fixtures/bridge/fake-claude-cli.mjs', '--flag']);
    assert.equal(adapter.formatInput?.('hello'), 'hello');
  });

  test('wraps input and extracts text in stream-json mode', () => {
    const adapter = new ClaudeBridgeAdapter({} as any);

    const input = JSON.parse(adapter.formatInput?.('hello') || '{}');
    assert.equal(input.type, 'user');
    assert.equal(input.message.content[0].text, 'hello');

    const chunk = [
      JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-4-5' }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Bridge ready<cast_turn_done/>' }] },
      }),
      '',
    ].join('\n');
    assert.equal(adapter.sanitizeOutput(chunk), 'Bridge ready<cast_turn_done/>');
  });

  test('uses stream-json result text only when assistant text was absent', () => {
    const adapter = new ClaudeBridgeAdapter({} as any);

    assert.equal(
      adapter.sanitizeOutput(`${JSON.stringify({ type: 'result', result: 'Fallback text<cast_turn_done/>' })}\n`),
      'Fallback text<cast_turn_done/>',
    );

    adapter.resetOutput?.();
    assert.equal(
      adapter.sanitizeOutput([
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Assistant text<cast_turn_done/>' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Duplicate result<cast_turn_done/>' }),
        '',
      ].join('\n')),
      'Assistant text<cast_turn_done/>',
    );
  });

  test('resets stream-json output state between provider starts', () => {
    const adapter = new ClaudeBridgeAdapter({} as any);

    adapter.sanitizeOutput(`${JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Assistant text<cast_turn_done/>' }] },
    })}\n`);
    adapter.resetOutput?.();

    assert.equal(
      adapter.sanitizeOutput(`${JSON.stringify({ type: 'result', result: 'New result<cast_turn_done/>' })}\n`),
      'New result<cast_turn_done/>',
    );
  });

  test('adds optional max budget to real Claude stream-json args', () => {
    const adapter = new ClaudeBridgeAdapter({
      CAST_BRIDGE_CLAUDE_MAX_BUDGET_USD: '0.05',
    } as any);

    assert.deepEqual(adapter.defaultArgs().slice(-2), ['--max-budget-usd', '0.05']);
  });

  test('classifies missing auth startup output', () => {
    const adapter = new ClaudeBridgeAdapter();
    const failure = adapter.classifyStartupFailure('Please login to Claude to continue');

    assert.equal(failure?.kind, 'auth_required');
  });

  test('supports raw command adapters for other provider CLIs', () => {
    const adapter = new CliBridgeAdapter('codex', {
      CAST_BRIDGE_CODEX_COMMAND: 'cast-codex',
      CAST_BRIDGE_CODEX_ARGS: '--dangerously-auto-approve-everything',
    } as any);

    assert.equal(adapter.id, 'codex');
    assert.equal(adapter.label, 'Codex CLI');
    assert.equal(adapter.defaultCommand(), 'cast-codex');
    assert.deepEqual(adapter.defaultArgs(), ['--dangerously-auto-approve-everything']);
    assert.equal(adapter.formatInput?.('hello'), 'hello');
    assert.equal(adapter.requiresToolResultFollowup(), false);
  });

  test('uses codex exec json mode by default', () => {
    const adapter = new CliBridgeAdapter('codex', {} as any);

    assert.equal(adapter.defaultCommand(), 'codex');
    assert.deepEqual(adapter.defaultArgs(), [
      'exec',
      '--ignore-user-config',
      '--ignore-rules',
      '--json',
      '--color',
      'never',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '-',
    ]);
    assert.equal(adapter.closeInputAfterWrite?.(), true);
    assert.equal(adapter.requiresToolResultFollowup(), true);
  });

  test('extracts final agent messages from codex json output', () => {
    const adapter = new CliBridgeAdapter('codex', {} as any);

    const output = adapter.sanitizeOutput([
      'Reading additional input from stdin...',
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_1' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_1', type: 'agent_message', text: 'Codex final<cast_turn_done/>' },
      }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }),
      '',
    ].join('\n'));

    assert.equal(output, 'Codex final<cast_turn_done/>');
  });

  test('recognizes supported bridge provider ids', () => {
    assert.equal(isBridgeProviderId('claude'), true);
    assert.equal(isBridgeProviderId('openrouter'), true);
    assert.equal(isBridgeProviderId('unknown'), false);
  });
});
