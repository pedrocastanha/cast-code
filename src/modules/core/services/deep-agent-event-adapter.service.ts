import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  CastRuntimeEvent,
  CastRuntimeEventType,
  CastRuntimeScope,
} from '../../runtime/types/runtime-event.types';

export type DeepAgentStreamVersion = 'auto' | 'v2' | 'v3';

export interface DeepAgentEventAdapterInput {
  agent: {
    streamEvents: (payload: unknown, config: any) => unknown;
  };
  payload: unknown;
  recursionLimit?: number;
  scope: CastRuntimeScope;
  streamVersion?: DeepAgentStreamVersion;
  provider?: string;
  providerLabel?: string;
  model?: string;
  correlationId?: string;
}

export interface DeepAgentRuntimeEnvelope {
  runtimeEvent: CastRuntimeEvent;
  rawEvent?: any;
  sourceVersion: Exclude<DeepAgentStreamVersion, 'auto'>;
}

interface StreamContext {
  scope: CastRuntimeScope;
  provider?: string;
  providerLabel?: string;
  model?: string;
  correlationId?: string;
  seq: number;
  startedAt: number;
  outputLength: number;
  toolRounds: number;
  toolStarts: Map<string, number>;
}

interface TokenUsage {
  input: number;
  output: number;
  cachedInput: number;
}

@Injectable()
export class DeepAgentEventAdapterService {
  async *stream(input: DeepAgentEventAdapterInput): AsyncGenerator<DeepAgentRuntimeEnvelope> {
    const context = this.createContext(input);
    const requestedVersion = this.resolveStreamVersion(input.streamVersion);

    if (requestedVersion === 'v2') {
      yield* this.streamV2(input, context);
      return;
    }

    if (requestedVersion === 'v3') {
      const result = this.startStream(input, 'v3');
      if (!this.hasV3Projections(result)) {
        throw new Error('DeepAgents v3 stream projections are not available');
      }
      yield* this.streamV3(result, context);
      return;
    }

    try {
      const result = this.startStream(input, 'v3');
      if (this.hasV3Projections(result)) {
        yield* this.streamV3(result, context);
        return;
      }
    } catch {
      // Auto mode is intentionally conservative: if v3 startup is not available,
      // keep the current v2 event stream behavior.
    }

    yield* this.streamV2(input, context);
  }

  private async *streamV2(
    input: DeepAgentEventAdapterInput,
    context: StreamContext,
  ): AsyncGenerator<DeepAgentRuntimeEnvelope> {
    const stream = this.startStream(input, 'v2');
    if (!this.isAsyncIterable(stream)) {
      throw new Error('DeepAgents v2 streamEvents did not return an async iterable');
    }

    yield this.envelope(this.runStarted(context), 'v2');
    try {
      for await (const rawEvent of stream) {
        for (const event of this.mapV2Event(rawEvent, context)) {
          yield this.envelope(event, 'v2', rawEvent);
        }
      }
      yield this.envelope(this.runCompleted(context), 'v2');
    } catch (error) {
      yield this.envelope(this.runFailed(context, error), 'v2');
      throw error;
    }
  }

  private async *streamV3(
    projection: any,
    context: StreamContext,
  ): AsyncGenerator<DeepAgentRuntimeEnvelope> {
    yield this.envelope(this.runStarted(context), 'v3');
    try {
      for await (const message of this.iterableProjection(projection.messages)) {
        const text = this.extractTextFromModelContent(await this.resolveProjectionValue(message?.text ?? message?.content ?? message));
        if (!text) {
          continue;
        }
        context.outputLength += text.length;
        yield this.envelope(this.event(context, 'runtime.message.delta', { text }), 'v3');
        yield this.envelope(this.event(context, 'runtime.message.completed', {
          text,
          outputLength: text.length,
        }), 'v3');
      }

      for await (const toolCall of this.iterableProjection(projection.toolCalls)) {
        yield* this.streamV3ToolCall(toolCall, context);
      }

      for await (const subagent of this.iterableProjection(projection.subagents)) {
        yield* this.streamV3Subagent(subagent, context);
      }

      yield this.envelope(this.runCompleted(context), 'v3');
    } catch (error) {
      yield this.envelope(this.runFailed(context, error), 'v3');
      throw error;
    }
  }

  private async *streamV3ToolCall(
    toolCall: any,
    context: StreamContext,
  ): AsyncGenerator<DeepAgentRuntimeEnvelope> {
    const startedAt = Date.now();
    context.toolRounds += 1;
    const toolName = String(toolCall?.name || toolCall?.toolName || toolCall?.id || 'tool');
    const callId = this.stringValue(toolCall?.id ?? toolCall?.callId ?? toolCall?.runId);
    yield this.envelope(this.event(context, 'runtime.tool.started', {
      toolName,
      callId,
      input: toolCall?.input,
    }), 'v3');

    try {
      const status = await this.resolveProjectionValue(toolCall?.status);
      const output = this.extractToolOutputText(await this.resolveProjectionValue(toolCall?.output ?? toolCall?.result));
      const durationMs = Math.max(0, Date.now() - startedAt);
      if (this.isFailedStatus(status)) {
        yield this.envelope(this.event(context, 'runtime.tool.failed', {
          toolName,
          callId,
          status: 'error',
          durationMs,
          message: output || 'Tool failed',
          summary: this.summarizeToolFailure(toolName, output || 'Tool failed'),
        }), 'v3');
        return;
      }

      yield this.envelope(this.event(context, 'runtime.tool.completed', {
        toolName,
        callId,
        status: 'ok',
        durationMs,
        summary: this.summarizeToolResult(toolName, output),
        outputPreview: this.preview(output, 2000),
      }), 'v3');
    } catch (error) {
      yield this.envelope(this.event(context, 'runtime.tool.failed', {
        toolName,
        callId,
        status: 'error',
        durationMs: Math.max(0, Date.now() - startedAt),
        errorClass: this.errorClass(error),
        message: this.errorMessage(error),
        summary: this.summarizeToolFailure(toolName, this.errorMessage(error)),
      }), 'v3');
    }
  }

  private async *streamV3Subagent(
    subagent: any,
    context: StreamContext,
  ): AsyncGenerator<DeepAgentRuntimeEnvelope> {
    const startedAt = Date.now();
    const subagentId = this.stringValue(subagent?.id ?? subagent?.subagentId ?? subagent?.name) ?? randomUUID();
    yield this.envelope(this.event(context, 'runtime.subagent.started', {
      subagentId,
      name: this.stringValue(subagent?.name),
    }), 'v3');

    try {
      const status = await this.resolveProjectionValue(subagent?.status);
      const output = this.extractToolOutputText(await this.resolveProjectionValue(subagent?.output ?? subagent?.result));
      const durationMs = Math.max(0, Date.now() - startedAt);
      if (this.isFailedStatus(status)) {
        yield this.envelope(this.event(context, 'runtime.subagent.failed', {
          subagentId,
          durationMs,
          message: output || 'Sub-agent failed',
        }), 'v3');
        return;
      }

      yield this.envelope(this.event(context, 'runtime.subagent.completed', {
        subagentId,
        status: 'completed',
        durationMs,
        summary: this.preview(output, 1000),
      }), 'v3');
    } catch (error) {
      yield this.envelope(this.event(context, 'runtime.subagent.failed', {
        subagentId,
        errorClass: this.errorClass(error),
        message: this.errorMessage(error),
        durationMs: Math.max(0, Date.now() - startedAt),
      }), 'v3');
    }
  }

  private mapV2Event(rawEvent: any, context: StreamContext): CastRuntimeEvent[] {
    switch (rawEvent?.event) {
    case 'on_chat_model_stream': {
      const text = this.extractTextFromModelContent(rawEvent?.data?.chunk?.content);
      if (!text) {
        return [];
      }
      context.outputLength += text.length;
      return [this.event(context, 'runtime.message.delta', { text })];
    }
    case 'on_chat_model_end': {
      const output = rawEvent?.data?.output;
      const usage = this.extractUsage(output);
      if (usage.input <= 0 && usage.output <= 0 && usage.cachedInput <= 0) {
        return [];
      }
      return [this.event(context, 'runtime.usage', {
        input: usage.input,
        output: usage.output,
        cachedInput: usage.cachedInput,
        model: this.stringValue(output?.response_metadata?.model_name ?? output?.response_metadata?.model),
      })];
    }
    case 'on_tool_start': {
      const toolName = String(rawEvent?.name || 'tool');
      const callId = this.stringValue(rawEvent?.run_id ?? rawEvent?.runId);
      if (callId) {
        context.toolStarts.set(callId, Date.now());
      }
      context.toolRounds += 1;
      return [this.event(context, 'runtime.tool.started', {
        toolName,
        callId,
        input: rawEvent?.data?.input,
      })];
    }
    case 'on_tool_end': {
      const toolName = String(rawEvent?.name || 'tool');
      const callId = this.stringValue(rawEvent?.run_id ?? rawEvent?.runId);
      const output = this.extractToolOutputText(rawEvent?.data?.output);
      const durationMs = this.durationForTool(context, callId);
      return [this.event(context, 'runtime.tool.completed', {
        toolName,
        callId,
        status: 'ok',
        durationMs,
        summary: this.summarizeToolResult(toolName, output),
        outputPreview: this.preview(output, 2000),
      })];
    }
    case 'on_tool_error': {
      const toolName = String(rawEvent?.name || 'tool');
      const callId = this.stringValue(rawEvent?.run_id ?? rawEvent?.runId);
      const error = rawEvent?.data?.error ?? rawEvent?.error;
      const message = this.errorMessage(error);
      const durationMs = this.durationForTool(context, callId);
      return [this.event(context, 'runtime.tool.failed', {
        toolName,
        callId,
        status: 'error',
        durationMs,
        errorClass: this.errorClass(error),
        message,
        summary: this.summarizeToolFailure(toolName, message),
      })];
    }
    default:
      return [];
    }
  }

  private startStream(
    input: DeepAgentEventAdapterInput,
    version: Exclude<DeepAgentStreamVersion, 'auto'>,
  ): unknown {
    return input.agent.streamEvents(input.payload, {
      version,
      recursionLimit: input.recursionLimit,
    });
  }

  private resolveStreamVersion(version: DeepAgentStreamVersion | undefined): DeepAgentStreamVersion {
    const explicit = version ?? process.env.CAST_DEEPAGENTS_STREAM_VERSION;
    if (explicit === 'v2' || explicit === 'v3' || explicit === 'auto') {
      return explicit;
    }
    return 'auto';
  }

  private createContext(input: DeepAgentEventAdapterInput): StreamContext {
    return {
      scope: input.scope,
      provider: input.provider,
      providerLabel: input.providerLabel,
      model: input.model,
      correlationId: input.correlationId,
      seq: 0,
      startedAt: Date.now(),
      outputLength: 0,
      toolRounds: 0,
      toolStarts: new Map(),
    };
  }

  private runStarted(context: StreamContext): CastRuntimeEvent {
    return this.event(context, 'runtime.run.started', {
      runtime: 'model',
      provider: context.provider,
      providerLabel: context.providerLabel,
      model: context.model,
    });
  }

  private runCompleted(context: StreamContext): CastRuntimeEvent {
    return this.event(context, 'runtime.run.completed', {
      status: 'completed',
      durationMs: Math.max(0, Date.now() - context.startedAt),
      toolRounds: context.toolRounds,
      outputLength: context.outputLength,
    });
  }

  private runFailed(context: StreamContext, error: unknown): CastRuntimeEvent {
    return this.event(context, 'runtime.run.failed', {
      errorClass: this.errorClass(error),
      message: this.errorMessage(error),
      durationMs: Math.max(0, Date.now() - context.startedAt),
    });
  }

  private event(
    context: StreamContext,
    type: CastRuntimeEventType,
    payload: Record<string, unknown>,
  ): CastRuntimeEvent {
    return {
      id: `runtime_${randomUUID()}`,
      seq: ++context.seq,
      timestamp: new Date().toISOString(),
      type,
      scope: context.scope,
      correlationId: context.correlationId,
      privacy: 'local',
      ...payload,
    } as CastRuntimeEvent;
  }

  private envelope(
    runtimeEvent: CastRuntimeEvent,
    sourceVersion: Exclude<DeepAgentStreamVersion, 'auto'>,
    rawEvent?: any,
  ): DeepAgentRuntimeEnvelope {
    return { runtimeEvent, sourceVersion, rawEvent };
  }

  private hasV3Projections(value: any): boolean {
    return Boolean(
      value
      && typeof value === 'object'
      && (
        this.isIterableProjection(value.messages)
        || this.isIterableProjection(value.toolCalls)
        || this.isIterableProjection(value.subagents)
      ),
    );
  }

  private async *iterableProjection(value: unknown): AsyncGenerator<any> {
    if (this.isAsyncIterable(value)) {
      yield* value;
      return;
    }
    if (this.isSyncIterable(value)) {
      for (const item of value) {
        yield item;
      }
    }
  }

  private isIterableProjection(value: unknown): boolean {
    return this.isAsyncIterable(value) || this.isSyncIterable(value);
  }

  private isAsyncIterable(value: unknown): value is AsyncIterable<any> {
    return Boolean(value && typeof (value as any)[Symbol.asyncIterator] === 'function');
  }

  private isSyncIterable(value: unknown): value is Iterable<any> {
    return Boolean(value && typeof (value as any)[Symbol.iterator] === 'function');
  }

  private async resolveProjectionValue(value: unknown): Promise<any> {
    if (value && typeof (value as any).then === 'function') {
      return (value as Promise<any>);
    }
    return value;
  }

  private extractUsage(output: any): TokenUsage {
    const usage = output?.usage_metadata
      || output?.usageMetadata
      || output?.response_metadata?.usage
      || output?.response_metadata?.usageMetadata
      || output?.response_metadata?.tokenUsage
      || output?.additional_kwargs?.usage
      || output?.additional_kwargs?.usageMetadata;

    if (!usage) {
      return { input: 0, output: 0, cachedInput: 0 };
    }

    return {
      input: usage.input_tokens
        || usage.prompt_tokens
        || usage.promptTokens
        || usage.inputTokens
        || usage.inputTokenCount
        || usage.promptTokenCount
        || 0,
      output: usage.output_tokens
        || usage.completion_tokens
        || usage.completionTokens
        || usage.outputTokens
        || usage.outputTokenCount
        || usage.candidatesTokenCount
        || 0,
      cachedInput: this.extractCachedInputTokens(usage),
    };
  }

  private extractCachedInputTokens(usage: any): number {
    return usage.input_token_details?.cache_read
      || usage.input_token_details?.cached_tokens
      || usage.inputTokenDetails?.cacheRead
      || usage.inputTokenDetails?.cachedTokens
      || usage.input_tokens_details?.cached_tokens
      || usage.inputTokensDetails?.cachedTokens
      || usage.prompt_tokens_details?.cached_tokens
      || usage.promptTokensDetails?.cachedTokens
      || usage.cache_read_input_tokens
      || usage.cacheReadInputTokens
      || usage.prompt_cache_hit_tokens
      || usage.promptCacheHitTokens
      || usage.cached_tokens
      || usage.cachedTokens
      || usage.cached_content_token_count
      || usage.cachedContentTokenCount
      || 0;
  }

  private extractTextFromModelContent(content: any): string {
    if (!content) {
      return '';
    }
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      }).join('');
    }
    if (typeof content?.text === 'string') {
      return content.text;
    }
    if (typeof content?.content === 'string') {
      return content.content;
    }
    return '';
  }

  private extractToolOutputText(output: any): string {
    if (output === undefined || output === null) {
      return '';
    }
    if (typeof output === 'string') {
      return output;
    }
    if (typeof output?.content === 'string') {
      return output.content;
    }
    if (output?.content) {
      return this.stringify(output.content);
    }
    if (typeof output?.output === 'string') {
      return output.output;
    }
    if (output?.output) {
      return this.stringify(output.output);
    }
    return typeof output === 'object' ? this.stringify(output) : String(output);
  }

  private summarizeToolResult(toolName: string, output: string): string {
    if (!output) {
      return `${toolName} ok`;
    }
    return `${toolName} ok - ${output.length} chars`;
  }

  private summarizeToolFailure(toolName: string, message: string): string {
    return `${toolName} failed${message ? ` - ${this.preview(message, 120)}` : ''}`;
  }

  private durationForTool(context: StreamContext, callId: string | undefined): number | undefined {
    if (!callId) {
      return undefined;
    }
    const startedAt = context.toolStarts.get(callId);
    context.toolStarts.delete(callId);
    return startedAt ? Math.max(0, Date.now() - startedAt) : undefined;
  }

  private preview(value: string, max: number): string {
    const redacted = this.redactSensitiveText(value || '');
    return redacted.length <= max ? redacted : redacted.slice(0, max);
  }

  private redactSensitiveText(value: string): string {
    return value
      .replace(/\b(?:sk|csk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_KEY]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');
  }

  private isFailedStatus(status: unknown): boolean {
    const normalized = String(status || '').toLowerCase();
    return ['error', 'failed', 'failure'].includes(normalized);
  }

  private errorClass(error: unknown): string {
    return this.stringValue((error as any)?.name) ?? 'Error';
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error
      ? error.message
      : String((error as any)?.message || error || 'Unknown error');
    return this.preview(message, 1200);
  }

  private stringValue(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    return String(value);
  }

  private stringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable output]';
    }
  }
}
