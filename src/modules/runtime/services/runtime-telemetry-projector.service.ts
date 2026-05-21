import { Injectable } from '@nestjs/common';
import type { PlatformEvent, PlatformEventType } from '../../platform/types';
import type { CastRuntimeEvent, CastRuntimeScope } from '../types/runtime-event.types';

@Injectable()
export class RuntimeTelemetryProjectorService {
  project(event: CastRuntimeEvent): PlatformEvent | null {
    switch (event.type) {
    case 'runtime.message.delta':
    case 'runtime.message.completed':
      return null;
    case 'runtime.run.started':
      return this.event(event, {
        runId: this.runId(event.scope),
        runtime: event.runtime,
        provider: event.provider,
        model: event.model,
      });
    case 'runtime.run.completed':
      return this.event(event, {
        runId: this.runId(event.scope),
        durationMs: event.durationMs,
        status: event.status,
      });
    case 'runtime.run.failed':
      return this.event(event, {
        runId: this.runId(event.scope),
        errorClass: event.errorClass,
        message: event.message,
      });
    case 'runtime.tool.started':
      return this.event(event, {
        runId: this.runId(event.scope),
        tool: event.toolName,
        scope: event.scope.kind,
      });
    case 'runtime.tool.completed':
      return this.event(event, {
        runId: this.runId(event.scope),
        tool: event.toolName,
        scope: event.scope.kind,
        status: event.status,
        durationMs: event.durationMs,
        summary: event.summary,
      });
    case 'runtime.tool.failed':
      return this.event(event, {
        runId: this.runId(event.scope),
        tool: event.toolName,
        scope: event.scope.kind,
        errorClass: event.errorClass,
        message: event.message,
      });
    case 'runtime.usage':
      return this.event(event, {
        runId: this.runId(event.scope),
        input: event.input,
        cachedInput: event.cachedInput,
        output: event.output,
        model: event.model,
        cost: event.cost,
      });
    case 'swarm.plan.created':
      return this.event(event, {
        planId: event.planId,
        taskCount: event.taskCount,
        maxWorkers: event.maxWorkers,
        integrationMode: event.integrationMode,
      });
    case 'swarm.plan.approved':
      return this.event(event, {
        planId: event.planId,
        runId: event.runId,
        integrationMode: event.integrationMode,
      });
    case 'swarm.run.started':
      return this.event(event, {
        runId: event.runId,
        taskCount: event.taskCount,
        maxWorkers: event.maxWorkers,
        runtime: event.runtime,
      });
    case 'swarm.run.completed':
      return this.event(event, {
        runId: event.runId,
        durationMs: event.durationMs,
        status: event.status,
        filesChanged: event.filesChanged,
      });
    case 'swarm.run.failed':
      return this.event(event, {
        runId: event.runId,
        errorClass: event.errorClass,
        message: event.message,
      });
    case 'swarm.task.started':
      return this.event(event, {
        runId: this.runId(event.scope),
        taskId: event.taskId,
        workerId: event.workerId,
      });
    case 'swarm.task.completed':
      return this.event(event, {
        runId: this.runId(event.scope),
        taskId: event.taskId,
        status: event.status,
        filesChanged: event.filesChanged,
      });
    case 'swarm.task.failed':
      return this.event(event, {
        runId: this.runId(event.scope),
        taskId: event.taskId,
        errorClass: event.errorClass,
        message: event.message,
      });
    case 'swarm.integration.started':
    case 'swarm.integration.completed':
    case 'swarm.integration.blocked':
      return this.event(event, {
        runId: event.runId,
        mode: event.mode,
        status: event.status,
        filesApplied: event.filesApplied,
        filesBlocked: event.filesBlocked,
        reason: event.reason,
      });
    default:
      return null;
    }
  }

  private event(event: CastRuntimeEvent, payload: Record<string, unknown>): PlatformEvent {
    return {
      type: event.type as PlatformEventType,
      ts: event.timestamp,
      payload: this.compact(payload),
    };
  }

  private compact(payload: Record<string, unknown>): Record<string, unknown> {
    const compacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value === 'string') {
        compacted[key] = this.truncate(value, key === 'summary' ? 500 : 120);
      } else if (typeof value === 'number') {
        if (Number.isFinite(value) && value >= 0) {
          compacted[key] = value;
        }
      } else if (typeof value === 'boolean') {
        compacted[key] = value;
      }
    }
    return compacted;
  }

  private runId(scope: CastRuntimeScope): string {
    return scope.runId;
  }

  private truncate(value: string, max: number): string {
    return value.length <= max ? value : value.slice(0, max);
  }
}
