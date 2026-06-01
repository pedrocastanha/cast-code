import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpCommandsService } from './mcp-commands.service';

function makeSmartInput() {
  return {
    pause() {},
    resume() {},
  } as any;
}

test('/mcp catalog prints governed metadata and connection state', async () => {
  const writes: string[] = [];
  const originalWrite = process.stdout.write;
  (process.stdout.write as any) = (chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  };

  try {
    const service = new McpCommandsService(
      {
        getUnscopedServerNames: () => ['figma'],
        getServerSummaries: () => [{ name: 'figma', status: 'connected', transport: 'http', toolCount: 0, toolNames: [], toolDescriptions: [] }],
      } as any,
    );

    await service.cmdMcp(['catalog', 'design'], makeSmartInput());

    const output = writes.join('');
    assert.match(output, /Figma Desktop/);
    assert.match(output, /design/);
    assert.match(output, /approval-required/);
    assert.match(output, /configured/);
    assert.match(output, /connected/);
  } finally {
    process.stdout.write = originalWrite;
  }
});
