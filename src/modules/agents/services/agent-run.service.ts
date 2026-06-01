import { Injectable, Optional } from '@nestjs/common';
import {
  AgentRun,
  AgentRunArtifact,
  AgentRunError,
  AgentRunStatus,
  CreateAgentRunInput,
} from '../types/agent-runtime.types';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';
import { TraceEventType } from '../../trace/types/trace.types';

@Injectable()
export class AgentRunService {
  private readonly runs = new Map<string, AgentRun>();

  constructor(
    @Optional() private readonly traceContext?: TraceContextService,
    @Optional() private readonly traceWriter?: TraceWriterService,
  ) {}

  createRun(input: CreateAgentRunInput): AgentRun {
    const context = this.traceContext?.getCurrent();
    const parentRunId = input.parentRunId || context?.rootRunId || 'root';
    const id = this.traceContext?.createChildRun(parentRunId, input.agentName)
      || `run_${input.agentName}_${Date.now().toString(36)}`;
    const run: AgentRun = {
      id,
      parentRunId,
      agentName: input.agentName,
      status: 'queued',
      task: input.task,
      inputContract: input.inputContract,
      skills: input.skills || input.inputContract.requiredSkills.map((name) => ({
        name,
        scope: 'unknown',
        version: 'unknown',
        reason: 'agent_required',
      })),
      tools: input.tools || input.inputContract.toolScope.map((name) => ({
        name,
        reason: 'agent_default',
      })),
      artifacts: [],
      errors: [],
    };
    this.runs.set(run.id, run);
    this.trace('agent.queued', run, {
      agentName: run.agentName,
      task: run.task,
      inputContract: run.inputContract,
      skills: run.skills,
      tools: run.tools,
    });
    return run;
  }

  startRun(id: string): AgentRun | undefined {
    return this.transition(id, 'running', 'agent.started');
  }

  completeRun(id: string, artifacts: AgentRunArtifact[] = []): AgentRun | undefined {
    const run = this.transition(id, 'completed', 'agent.completed');
    if (!run) return undefined;
    run.artifacts.push(...artifacts);
    this.closeRun(run);
    this.trace('agent.completed', run, { artifacts: run.artifacts });
    return run;
  }

  failRun(id: string, error: AgentRunError): AgentRun | undefined {
    const run = this.transition(id, 'failed', 'agent.failed');
    if (!run) return undefined;
    run.errors.push(error);
    this.closeRun(run);
    this.trace('agent.failed', run, { errors: run.errors });
    return run;
  }

  cancelRun(id: string): AgentRun | undefined {
    const run = this.getRun(id);
    if (!run || this.isTerminal(run.status)) return run;
    run.status = 'cancelled';
    this.closeRun(run);
    this.trace('agent.cancelled', run, { agentName: run.agentName, task: run.task });
    return run;
  }

  getRun(id: string): AgentRun | undefined {
    return this.runs.get(id);
  }

  listRuns(): AgentRun[] {
    return Array.from(this.runs.values()).sort((a, b) => {
      const aTime = a.endedAt || a.startedAt || '';
      const bTime = b.endedAt || b.startedAt || '';
      return bTime.localeCompare(aTime);
    });
  }

  private transition(id: string, status: AgentRunStatus, eventType: TraceEventType): AgentRun | undefined {
    const run = this.runs.get(id);
    if (!run || this.isTerminal(run.status)) return run;
    run.status = status;
    if (status === 'running') {
      run.startedAt = new Date().toISOString();
      this.trace(eventType, run, { agentName: run.agentName, task: run.task });
    }
    return run;
  }

  private closeRun(run: AgentRun): void {
    run.endedAt = new Date().toISOString();
    if (run.startedAt) {
      run.durationMs = new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime();
    }
  }

  private isTerminal(status: AgentRunStatus): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timed_out';
  }

  private trace(type: TraceEventType, run: AgentRun, payload: Record<string, unknown>): void {
    if (!this.traceContext || !this.traceWriter) return;
    const context = this.traceContext.getCurrent();
    this.traceWriter.append({
      eventId: this.traceContext.nextEventId(),
      sessionId: context.sessionId,
      runId: run.id,
      parentRunId: run.parentRunId,
      type,
      payload,
    });
  }
}
