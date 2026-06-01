import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { AgentRunService } from './agent-run.service';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceSanitizerService } from '../../trace/services/trace-sanitizer.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import { TraceReaderService } from '../../trace/services/trace-reader.service';

describe('AgentRunService', () => {
  test('tracks run lifecycle and emits trace events', async () => {
    const traceDir = await mkdtemp(path.join(os.tmpdir(), 'cast-agent-runs-'));
    const previousTraceDir = process.env.CAST_TRACE_DIR;
    process.env.CAST_TRACE_DIR = traceDir;

    try {
      const context = new TraceContextService();
      context.startSession({ project: '/repo', model: 'test/model' });
      const writer = new TraceWriterService(context, new TraceSanitizerService());
      const service = new AgentRunService(context, writer);

      const run = service.createRun({
        agentName: 'api-engineer',
        task: 'Design the health endpoint contract',
        inputContract: {
          prompt: 'Design only.',
          fileOwnership: [{ path: 'src/modules/health', mode: 'read' }],
          toolScope: ['read_file'],
          requiredSkills: ['api-design'],
          expectedOutput: { kind: 'analysis', requiredSections: ['Summary', 'Contract'] },
          acceptanceCriteria: ['No file edits'],
        },
      });

      assert.equal(run.status, 'queued');
      assert.match(run.id, /api-engineer/);

      service.startRun(run.id);
      service.completeRun(run.id, [{
        kind: 'handoff',
        title: 'Contract',
        content: 'GET /health returns 200.',
      }]);

      const completed = service.getRun(run.id);
      assert.equal(completed?.status, 'completed');
      assert.equal(completed?.artifacts[0].title, 'Contract');

      const listed = service.listRuns();
      assert.equal(listed.length, 1);
      assert.equal(listed[0].agentName, 'api-engineer');

      const traceEvents = new TraceReaderService().readTrace(writer.getCurrentTraceRef().tracePath);
      assert.deepEqual(traceEvents.map((event) => event.type), [
        'agent.queued',
        'agent.started',
        'agent.completed',
      ]);
    } finally {
      if (previousTraceDir === undefined) {
        delete process.env.CAST_TRACE_DIR;
      } else {
        process.env.CAST_TRACE_DIR = previousTraceDir;
      }
    }
  });
});
