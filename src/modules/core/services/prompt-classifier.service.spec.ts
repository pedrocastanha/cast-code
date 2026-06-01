import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PromptClassifierService } from './prompt-classifier.service';

describe('PromptClassifierService', () => {
  test('does not add MCP context just because an MCP server is connected', () => {
    const classifier = new PromptClassifierService();

    assert.deepEqual(
      classifier.classify('fala comigo', {
        hasMcpConnected: true,
        hasProjectContext: false,
        hasMemory: false,
        mentionsInMessage: false,
      }),
      [],
    );
  });

  test('adds MCP context when the user asks for an external MCP-backed service', () => {
    const classifier = new PromptClassifierService();

    assert(
      classifier.classify('pega esse design no Figma', {
        hasMcpConnected: true,
        hasProjectContext: false,
        hasMemory: false,
        mentionsInMessage: false,
      }).includes('mcp'),
    );
  });
});
