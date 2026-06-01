import { Injectable } from '@nestjs/common';
import type {
  BridgeParseResult,
  BridgeProtocolError,
  BridgeToolCall,
  BridgeToolManifest,
  BridgeToolResult,
  BridgeUserTurn,
} from '../types/bridge.types';

interface BlockRange {
  start: number;
  end: number;
}

@Injectable()
export class BridgeProtocolService {
  private pending = '';
  private readonly seenCallIds = new Set<string>();
  private anonymousCounter = 0;

  buildSystemPrompt(manifest: BridgeToolManifest, providerLabel = 'Provider CLI'): string {
    return [
      'You are running inside Cast Bridge.',
      `${providerLabel} thinks. Cast executes tools.`,
      'Use Cast tools by emitting exactly one or more <cast_tool_call> blocks.',
      'Only Cast may emit <cast_tool_result> blocks. Never invent or echo tool results.',
      'If you emit a <cast_tool_call>, stop there and wait for Cast to return the result before answering.',
      'Do not claim you read, edited, searched, or executed anything unless Cast returned a <cast_tool_result>.',
      'When no more tools are needed, answer normally and end the turn with <cast_turn_done/>.',
      'Tool call format:',
      '<cast_tool_call id="call_01">',
      '{"name":"read_file","arguments":{"file_path":"README.md"}}',
      '</cast_tool_call>',
      'Available tools:',
      JSON.stringify(manifest.tools, null, 2),
    ].join('\n');
  }

  buildHandshakePrompt(
    manifest: BridgeToolManifest,
    providerId = 'provider',
    providerLabel = 'Provider CLI',
  ): string {
    return [
      this.buildSystemPrompt(manifest, providerLabel),
      `If you understand, respond with exactly: <cast_bridge_ready provider="${this.escapeAttribute(providerId)}"/>`,
    ].join('\n');
  }

  buildUserTurn(turn: BridgeUserTurn): string {
    return [
      `<cast_user_turn id="${this.escapeAttribute(turn.id)}">`,
      turn.message,
      '</cast_user_turn>',
    ].join('\n');
  }

  buildToolResult(result: BridgeToolResult): string {
    const payload =
      result.status === 'ok'
        ? { content: result.content ?? '' }
        : { error: result.error ?? 'Tool failed' };

    return [
      `<cast_tool_result id="${this.escapeAttribute(result.id)}" status="${result.status}">`,
      JSON.stringify(payload),
      '</cast_tool_result>',
    ].join('\n');
  }

  parseProviderOutput(chunk: string): BridgeParseResult {
    const source = this.stripAnsi(this.pending + chunk);
    this.pending = '';

    const errors: BridgeProtocolError[] = [];
    const toolCalls: BridgeToolCall[] = [];
    const removableRanges: BlockRange[] = [];
    const protectedRanges = this.findCompleteBlocks(source, 'cast_tool_result');
    removableRanges.push(...protectedRanges);

    const completeCallRanges = this.findCompleteBlocks(source, 'cast_tool_call')
      .filter((range) => !this.isInsideAnyRange(range, protectedRanges));

    for (const range of completeCallRanges) {
      const raw = source.slice(range.start, range.end);
      removableRanges.push(range);

      const parsed = this.parseToolCall(raw);
      if ('error' in parsed) {
        errors.push(parsed.error);
        continue;
      }

      if (this.seenCallIds.has(parsed.call.id)) {
        continue;
      }

      this.seenCallIds.add(parsed.call.id);
      toolCalls.push(parsed.call);
    }

    const incompleteStart = this.findIncompleteProtocolStart(source, removableRanges);
    const textEnd = incompleteStart ?? source.length;
    if (incompleteStart !== undefined) {
      this.pending = source.slice(incompleteStart);
    }

    const completedText = source.slice(0, textEnd);
    const turnDone = /<cast_turn_done\s*\/>/i.test(completedText);
    const finalText = this.cleanFinalText(completedText, removableRanges);

    return {
      finalText,
      toolCalls,
      errors,
      turnDone,
    };
  }

  reset(): void {
    this.pending = '';
    this.seenCallIds.clear();
    this.anonymousCounter = 0;
  }

  private parseToolCall(raw: string): { call: BridgeToolCall } | { error: BridgeProtocolError } {
    const openTag = raw.match(/^<cast_tool_call\b([^>]*)>/i);
    const bodyMatch = raw.match(/^<cast_tool_call\b[^>]*>([\s\S]*?)<\/cast_tool_call>$/i);
    const id = openTag?.[1]?.match(/\bid\s*=\s*"([^"]+)"/i)?.[1] ?? `call_${++this.anonymousCounter}`;
    const body = bodyMatch?.[1]?.trim() ?? '';

    try {
      const payload = JSON.parse(body) as {
        name?: unknown;
        arguments?: unknown;
      };

      if (typeof payload.name !== 'string' || !payload.name.trim()) {
        return {
          error: {
            message: 'Malformed tool call: expected string field "name".',
            raw,
          },
        };
      }

      const args = this.normalizeArguments(payload.arguments);
      return {
        call: {
          id,
          name: payload.name,
          arguments: args,
          raw,
        },
      };
    } catch (error) {
      return {
        error: {
          message: `Malformed tool call JSON: ${(error as Error).message}`,
          raw,
        },
      };
    }
  }

  private normalizeArguments(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private findCompleteBlocks(source: string, tag: 'cast_tool_call' | 'cast_tool_result'): BlockRange[] {
    const ranges: BlockRange[] = [];
    const pattern = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, 'gi');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return ranges;
  }

  private findIncompleteProtocolStart(source: string, removableRanges: BlockRange[]): number | undefined {
    const starts = ['<cast_tool_call', '<cast_tool_result'];
    let earliest: number | undefined;

    for (const startToken of starts) {
      const start = source.lastIndexOf(startToken);
      if (start < 0 || this.indexInsideAnyRange(start, removableRanges)) {
        continue;
      }

      const closeToken = startToken === '<cast_tool_call' ? '</cast_tool_call>' : '</cast_tool_result>';
      const close = source.indexOf(closeToken, start);
      if (close >= 0) {
        continue;
      }

      earliest = earliest === undefined ? start : Math.min(earliest, start);
    }

    return earliest;
  }

  private cleanFinalText(source: string, ranges: BlockRange[]): string {
    const sorted = ranges
      .slice()
      .sort((a, b) => a.start - b.start)
      .filter((range) => range.start < source.length);

    let cursor = 0;
    let text = '';

    for (const range of sorted) {
      text += source.slice(cursor, range.start);
      cursor = Math.max(cursor, range.end);
    }

    text += source.slice(cursor);

    return text
      .replace(/<cast_turn_done\s*\/>/gi, '')
      .replace(/<cast_bridge_ready\b[^>]*\/>/gi, '')
      .trimEnd();
  }

  private isInsideAnyRange(candidate: BlockRange, ranges: BlockRange[]): boolean {
    return ranges.some((range) => candidate.start >= range.start && candidate.end <= range.end);
  }

  private indexInsideAnyRange(index: number, ranges: BlockRange[]): boolean {
    return ranges.some((range) => index >= range.start && index < range.end);
  }

  private stripAnsi(value: string): string {
    return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
  }

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
