import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BridgeSessionService } from './bridge-session.service';
import { BridgeProtocolService } from './bridge-protocol.service';
import { BridgeToolExecutorService } from './bridge-tool-executor.service';
import { BridgeTranscriptService } from './bridge-transcript.service';
import type {
  BridgeRuntimeResult,
  BridgeProviderId,
  BridgeToolCall,
  BridgeToolResult,
  BridgeUserTurn,
  BridgeRuntimeCallbacks,
} from '../types/bridge.types';
import type { CastRuntimeEvent } from '../../runtime/types/runtime-event.types';

const DEFAULT_TURN_IDLE_MS = Number(process.env.CAST_BRIDGE_TURN_IDLE_MS || 1200);
const DEFAULT_FIRST_BYTE_MS = Number(process.env.CAST_BRIDGE_TURN_FIRST_BYTE_MS || 30_000);
const DEFAULT_MAX_TOOL_ROUNDS = Number(process.env.CAST_BRIDGE_MAX_TOOL_ROUNDS || 12);
type RuntimeEventPatch = Record<string, unknown> & { type: CastRuntimeEvent['type'] };

@Injectable()
export class BridgeRuntimeService {
  constructor(
    private readonly session: BridgeSessionService,
    private readonly protocol: BridgeProtocolService,
    private readonly executor: BridgeToolExecutorService,
    private readonly transcript: BridgeTranscriptService,
  ) {}

  async runUserTurn(
    turn: BridgeUserTurn,
    options: { projectRoot: string; idleMs?: number; firstByteMs?: number; maxToolRounds?: number } & BridgeRuntimeCallbacks,
  ): Promise<BridgeRuntimeResult> {
    return this.runUserTurnOnSession(this.session, turn, options);
  }

  async runUserTurnOnSession(
    session: BridgeSessionService,
    turn: BridgeUserTurn,
    options: { projectRoot: string; idleMs?: number; firstByteMs?: number; maxToolRounds?: number } & BridgeRuntimeCallbacks,
  ): Promise<BridgeRuntimeResult> {
    this.protocol.reset();

    const provider = session.getProviderId();
    const providerLabel = session.getProviderLabel();
    const runStartedAt = Date.now();
    let runtimeSeq = 0;
    const emitRuntimeEvent = (event: RuntimeEventPatch) => {
      options.onRuntimeEvent?.({
        id: randomUUID(),
        seq: ++runtimeSeq,
        timestamp: new Date().toISOString(),
        scope: { kind: 'bridge', runId: turn.id, provider },
        privacy: 'local',
        ...event,
      } as CastRuntimeEvent);
    };
    emitRuntimeEvent({
      type: 'runtime.run.started',
      runtime: 'bridge',
      provider,
      providerLabel,
    });
    const idleMs = options.idleMs ?? DEFAULT_TURN_IDLE_MS;
    const firstByteMs = options.firstByteMs ?? DEFAULT_FIRST_BYTE_MS;
    const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    const output: string[] = [];
    const toolResults: string[] = [];
    let toolRounds = 0;
    let sawToolCall = false;
    let sawProviderData = false;
    let done = false;
    let lastActivity = Date.now();
    let runtimeError: Error | null = null;
    let pending = Promise.resolve();

    const unsubscribe = session.onData((chunk) => {
      if (chunk.length === 0) {
        return;
      }
      pending = pending
        .then(() => this.handleChunk({
          session,
          chunk,
          turn,
          projectRoot: options.projectRoot,
          provider,
          maxToolRounds,
          getToolRounds: () => toolRounds,
          incrementToolRounds: () => {
            toolRounds++;
          },
          appendOutput: (value) => output.push(value),
          clearOutput: () => {
            output.length = 0;
          },
          collectToolResult: (value) => toolResults.push(value),
          onOutputChunk: options.onOutputChunk,
          onToolCall: options.onToolCall,
          onToolResult: options.onToolResult,
          emitRuntimeEvent,
          markToolCall: () => {
            sawToolCall = true;
          },
          markDone: () => {
            done = true;
          },
          markActivity: () => {
            sawProviderData = true;
            lastActivity = Date.now();
          },
        }))
        .catch((error) => {
          runtimeError = error instanceof Error ? error : new Error(String(error));
          done = true;
        });
    });
    session.onceExit(() => {
      lastActivity = Date.now();
      done = true;
    });

    const prompt = this.protocol.buildUserTurn({
      ...turn,
      message: [
        this.protocol.buildSystemPrompt(this.executor.getManifest(), providerLabel),
        '',
        'User request:',
        turn.message,
      ].join('\n'),
    });
    await this.transcript.append(options.projectRoot, {
      id: randomUUID(),
      sessionId: turn.id,
      createdAt: new Date().toISOString(),
      direction: 'to_provider',
      provider,
      turnId: turn.id,
      redactedText: prompt,
    });
    await session.write(prompt);
    lastActivity = Date.now();

    try {
      while (true) {
        await pending;
        if (runtimeError) {
          throw runtimeError;
        }
        if (done) {
          break;
        }
        const currentTimeoutMs = sawProviderData ? idleMs : firstByteMs;
        if (Date.now() - lastActivity >= currentTimeoutMs) {
          break;
        }
        await this.sleep(Math.min(50, currentTimeoutMs));
      }
    } finally {
      unsubscribe?.();
    }

    if (
      toolResults.length > 0
      && sawToolCall
      && output.join('').trim() === ''
      && !turn.id.includes('_tool_followup')
    ) {
      await session.start({ cwd: options.projectRoot });
      const followup = await this.runResponseOnlyTurn(
        session,
        {
          id: `${turn.id}_tool_followup`,
          message: [
            'Answer the original user request using only the Cast tool results below.',
            'Ignore any previous provider output; it may be stale or fabricated.',
            'The local tools have already been executed by Cast.',
            'Do not call tools. Do not emit cast_tool_call, cast_tool_result, XML, or markdown fences.',
            'Return only the final answer, then <cast_turn_done/>.',
            '',
            'Final answer request:',
            this.sanitizeRequestForResponseOnly(turn.message),
            '',
            'Cast tool results:',
            toolResults.join('\n\n'),
          ].join('\n'),
        },
        {
          projectRoot: options.projectRoot,
          idleMs,
          firstByteMs,
          onOutputChunk: options.onOutputChunk,
          emitRuntimeEvent,
        },
      );
      const finalOutput = followup.output.trim() || this.buildFallbackResponse(turn.message, toolResults);
      emitRuntimeEvent({
        type: 'runtime.message.completed',
        text: finalOutput,
        outputLength: finalOutput.length,
      });
      emitRuntimeEvent({
        type: 'runtime.run.completed',
        status: 'completed',
        durationMs: Date.now() - runStartedAt,
        toolRounds: toolRounds + followup.toolRounds,
        outputLength: finalOutput.length,
      });
      return {
        output: finalOutput,
        toolRounds: toolRounds + followup.toolRounds,
      };
    }

    const finalOutput = output.join('');
    emitRuntimeEvent({
      type: 'runtime.message.completed',
      text: finalOutput,
      outputLength: finalOutput.length,
    });
    emitRuntimeEvent({
      type: 'runtime.run.completed',
      status: 'completed',
      durationMs: Date.now() - runStartedAt,
      toolRounds,
      outputLength: finalOutput.length,
    });
    return {
      output: finalOutput,
      toolRounds,
    };
  }

  private async handleChunk(input: {
    session: BridgeSessionService;
    chunk: string;
    turn: BridgeUserTurn;
    projectRoot: string;
    provider: BridgeProviderId;
    maxToolRounds: number;
    getToolRounds(): number;
    incrementToolRounds(): void;
    appendOutput(value: string): void;
    clearOutput(): void;
    collectToolResult(value: string): void;
    onOutputChunk?: (chunk: string) => void;
    onToolCall?: (call: BridgeToolCall) => void;
    onToolResult?: (result: BridgeToolResult) => void;
    emitRuntimeEvent(event: RuntimeEventPatch): void;
    markToolCall(): void;
    markDone(): void;
    markActivity(): void;
  }): Promise<void> {
    input.markActivity();

    await this.transcript.append(input.projectRoot, {
      id: randomUUID(),
      sessionId: input.turn.id,
      createdAt: new Date().toISOString(),
      direction: 'from_provider',
      provider: input.provider,
      turnId: input.turn.id,
      redactedText: input.chunk,
    });

    const parsed = this.protocol.parseProviderOutput(input.chunk);
    if (parsed.finalText && parsed.toolCalls.length === 0) {
      input.appendOutput(parsed.finalText);
      input.onOutputChunk?.(parsed.finalText);
      input.emitRuntimeEvent({
        type: 'runtime.message.delta',
        text: parsed.finalText,
      });
    }

    for (const error of parsed.errors) {
      await input.session.write(this.protocol.buildToolResult({
        id: 'protocol_error',
        name: 'protocol',
        status: 'error',
        error: error.message,
      }));
    }

    for (const call of parsed.toolCalls) {
      input.markToolCall();
      input.onToolCall?.(call);
      input.clearOutput();
      const startedAt = Date.now();
      input.emitRuntimeEvent({
        type: 'runtime.tool.started',
        toolName: call.name,
        callId: call.id,
      });
      const result = await this.executeToolCall(call, input);
      input.onToolResult?.(result);
      const durationMs = Date.now() - startedAt;
      if (result.status === 'ok') {
        input.emitRuntimeEvent({
          type: 'runtime.tool.completed',
          toolName: result.name,
          callId: result.id,
          status: 'ok',
          durationMs,
          summary: this.summarizeToolResult(result),
        });
      } else {
        input.emitRuntimeEvent({
          type: 'runtime.tool.failed',
          toolName: result.name,
          callId: result.id,
          status: 'error',
          durationMs,
          errorClass: 'BridgeToolError',
          message: this.truncate(result.error || 'Bridge tool failed', 120),
          summary: this.summarizeToolResult(result),
        });
      }
      input.collectToolResult(this.formatToolResultForFollowup(result));
    }

    if (parsed.turnDone) {
      input.markDone();
    }
  }

  private async executeToolCall(
    call: BridgeToolCall,
    input: {
      session: BridgeSessionService;
      projectRoot: string;
      turn: BridgeUserTurn;
      provider: BridgeProviderId;
      maxToolRounds: number;
      getToolRounds(): number;
      incrementToolRounds(): void;
    },
  ): Promise<BridgeToolResult> {
    if (input.getToolRounds() >= input.maxToolRounds) {
      const result = {
        id: call.id,
        name: call.name,
        status: 'error',
        error: `Maximum bridge tool rounds reached: ${input.maxToolRounds}`,
      } as const;
      await this.writeToolResult(input.session, result);
      return result;
    }

    input.incrementToolRounds();
    await this.transcript.append(input.projectRoot, {
      id: randomUUID(),
      sessionId: input.turn.id,
      createdAt: new Date().toISOString(),
      direction: 'tool_call',
      provider: input.provider,
      turnId: input.turn.id,
      callId: call.id,
      redactedText: call.raw,
      metadata: { name: call.name },
    });

    const result = await this.executor.execute(call);
    await this.transcript.append(input.projectRoot, {
      id: randomUUID(),
      sessionId: input.turn.id,
      createdAt: new Date().toISOString(),
      direction: 'tool_result',
      provider: input.provider,
      turnId: input.turn.id,
      callId: call.id,
      redactedText: result.status === 'ok' ? result.content : result.error,
      metadata: { name: call.name, status: result.status },
    });

    await this.writeToolResult(input.session, result);
    return result;
  }

  private async writeToolResult(session: BridgeSessionService, result: BridgeToolResult): Promise<void> {
    try {
      await session.write(this.protocol.buildToolResult(result));
    } catch {
      // One-shot providers such as `claude -p` may exit after emitting a tool call.
      // The runtime will open a follow-up provider turn with the collected result.
    }
  }

  private async runResponseOnlyTurn(
    session: BridgeSessionService,
    turn: BridgeUserTurn,
    options: { projectRoot: string; idleMs: number; firstByteMs: number; emitRuntimeEvent?: (event: RuntimeEventPatch) => void } & Pick<BridgeRuntimeCallbacks, 'onOutputChunk'>,
  ): Promise<BridgeRuntimeResult> {
    this.protocol.reset();

    const provider = session.getProviderId();
    const output: string[] = [];
    let done = false;
    let sawProviderData = false;
    let lastActivity = Date.now();
    let runtimeError: Error | null = null;
    let pending = Promise.resolve();

    const unsubscribe = session.onData((chunk) => {
      if (chunk.length === 0) {
        return;
      }
      pending = pending
        .then(async () => {
          sawProviderData = true;
          lastActivity = Date.now();
          await this.transcript.append(options.projectRoot, {
            id: randomUUID(),
            sessionId: turn.id,
            createdAt: new Date().toISOString(),
            direction: 'from_provider',
            provider,
            turnId: turn.id,
            redactedText: chunk,
          });

          const parsed = this.protocol.parseProviderOutput(chunk);
          if (parsed.finalText && parsed.toolCalls.length === 0) {
            output.push(parsed.finalText);
            options.onOutputChunk?.(parsed.finalText);
            options.emitRuntimeEvent?.({
              type: 'runtime.message.delta',
              text: parsed.finalText,
            });
          }
          if (parsed.turnDone) {
            done = true;
          }
        })
        .catch((error) => {
          runtimeError = error instanceof Error ? error : new Error(String(error));
          done = true;
        });
    });
    session.onceExit(() => {
      lastActivity = Date.now();
      done = true;
    });

    await this.transcript.append(options.projectRoot, {
      id: randomUUID(),
      sessionId: turn.id,
      createdAt: new Date().toISOString(),
      direction: 'to_provider',
      provider,
      turnId: turn.id,
      redactedText: turn.message,
    });
    await session.write(turn.message);
    lastActivity = Date.now();

    try {
      while (true) {
        await pending;
        if (runtimeError) {
          throw runtimeError;
        }
        if (done) {
          break;
        }
        const currentTimeoutMs = sawProviderData ? options.idleMs : options.firstByteMs;
        if (Date.now() - lastActivity >= currentTimeoutMs) {
          break;
        }
        await this.sleep(Math.min(50, currentTimeoutMs));
      }
    } finally {
      unsubscribe?.();
    }

    return {
      output: output.join(''),
      toolRounds: 0,
    };
  }

  private formatToolResultForFollowup(result: BridgeToolResult): string {
    const body = result.status === 'ok'
      ? result.content ?? ''
      : result.error ?? 'Tool failed';
    return [
      `Tool ${result.name} (${result.id}) ${result.status}:`,
      body,
    ].join('\n');
  }

  private summarizeToolResult(result: BridgeToolResult): string {
    if (result.status === 'error') {
      return `${result.name} error - ${this.truncate(result.error || 'unknown error', 120)}`;
    }
    const content = result.content || '';
    const lines = content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length;
    const bytes = Buffer.byteLength(content, 'utf8');
    return `${result.name} ok - ${lines} lines, ${bytes} B`;
  }

  private truncate(value: string, max: number): string {
    return value.length <= max ? value : value.slice(0, max);
  }

  private sanitizeRequestForResponseOnly(message: string): string {
    return message
      .replace(/usando a ferramenta\s+[a-z0-9_-]+(?:\s+do\s+Cast)?/gi, '')
      .replace(/using\s+(?:the\s+)?[a-z0-9_-]+\s+tool/gi, '')
      .replace(/n[aã]o invente[^.?!]*(?:[.?!]|$)/gi, '')
      .replace(/se chamar\s+tool[^.?!]*(?:[.?!]|$)/gi, '')
      .replace(/\b(leia|read)\s+(package\.json)\s+(?:e|and)\s+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private buildFallbackResponse(originalRequest: string, toolResults: string[]): string {
    const packageScripts = this.extractPackageScripts(toolResults.join('\n'));
    if (/scripts?/i.test(originalRequest) && packageScripts.length > 0) {
      return packageScripts
        .slice(0, 3)
        .map(([name, command], index) => `${index + 1}. \`${name}\` - \`${command}\``)
        .join('\n');
    }

    return toolResults.join('\n\n');
  }

  private extractPackageScripts(value: string): Array<[string, string]> {
    const withoutHeaders = value
      .split('\n')
      .filter((line) => !/^Tool\s+\S+\s+\([^)]+\)\s+\w+:/i.test(line))
      .map((line) => line.replace(/^\d+:\s?/, ''))
      .join('\n');
    const start = withoutHeaders.indexOf('{');
    const end = withoutHeaders.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return [];
    }

    try {
      const parsed = JSON.parse(withoutHeaders.slice(start, end + 1)) as {
        scripts?: Record<string, unknown>;
      };
      return Object.entries(parsed.scripts || {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    } catch {
      return [];
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
