import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RuntimeTelemetryProjectorService } from './runtime-telemetry-projector.service';
import type { CastRuntimeEvent } from '../types/runtime-event.types';

describe('RuntimeTelemetryProjectorService', () => {
  test('drops raw assistant text events from platform telemetry', () => {
    const projector = new RuntimeTelemetryProjectorService();
    const event: CastRuntimeEvent = {
      id: 'evt_message_1',
      seq: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      type: 'runtime.message.delta',
      scope: { kind: 'bridge', runId: 'turn_1', provider: 'codex' },
      privacy: 'local',
      text: 'raw assistant text that must stay local',
    };

    assert.equal(projector.project(event), null);
  });

  test('projects bridge tool completion as sanitized metadata only', () => {
    const projector = new RuntimeTelemetryProjectorService();
    const event: CastRuntimeEvent = {
      id: 'evt_tool_1',
      seq: 2,
      timestamp: '2026-05-20T00:00:01.000Z',
      type: 'runtime.tool.completed',
      scope: { kind: 'bridge', runId: 'turn_1', provider: 'codex' },
      privacy: 'local',
      toolName: 'read_file',
      status: 'ok',
      durationMs: 42,
      summary: 'read_file ok - 2 lines, 80 B',
      outputPreview: 'raw file content must not be projected',
    };

    assert.deepEqual(projector.project(event), {
      type: 'runtime.tool.completed',
      ts: '2026-05-20T00:00:01.000Z',
      payload: {
        runId: 'turn_1',
        tool: 'read_file',
        scope: 'bridge',
        status: 'ok',
        durationMs: 42,
        summary: 'read_file ok - 2 lines, 80 B',
      },
    });
  });
});
