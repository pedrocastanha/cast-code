import { Box, Colors, Icons } from '../../modules/repl/utils/theme';
import { padVisible, stripAnsi, truncateVisible, visibleWidth } from './cli-renderer';
import {
  formatDuration,
  getToolDisplayName,
  getToolInputSummary,
  getToolOutputBodyLines,
  getToolResultSummary,
} from './tool-call-details';
import type { ToolCallRenderResult, ToolCallRenderState } from './tool-call.types';

export interface RenderToolCallOptions {
  terminalWidth?: number;
  spinnerFrame?: string;
  indent?: number;
}

function countLines(content: string): number {
  if (!content) return 0;
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n$/, '');
  if (!normalized) return 0;
  return normalized.split('\n').length;
}

function buildBoxRow(content: string, innerWidth: number, borderColor: string): string {
  const visible = truncateVisible(content, innerWidth);
  return `${borderColor}${Box.vertical}${Colors.reset} ${padVisible(visible, innerWidth)} ${borderColor}${Box.vertical}${Colors.reset}`;
}

function buildTitleRow(title: string, boxWidth: number, borderColor: string, titleColor: string): string {
  const label = `${Box.horizontal} ${title} `;
  const fill = Math.max(0, boxWidth - 2 - label.length);
  return `${borderColor}${Box.topLeft}${titleColor}${label}${borderColor}${Box.horizontal.repeat(fill)}${Box.topRight}${Colors.reset}`;
}

export function buildToolCallRenderState(
  event: {
    type: 'started' | 'completed' | 'failed';
    toolName: string;
    callId?: string;
    input?: unknown;
    output?: string;
    durationMs?: number;
    message?: string;
  },
  existing?: Partial<ToolCallRenderState>,
): ToolCallRenderState {
  const id = event.callId ?? existing?.id ?? `${event.toolName}:${Date.now()}`;
  const inputSummary = existing?.inputSummary ?? getToolInputSummary(event.toolName, event.input);

  if (event.type === 'started') {
    return {
      id,
      toolName: event.toolName,
      inputSummary,
      status: 'running',
      expanded: false,
    };
  }

  if (event.type === 'failed') {
    return {
      id,
      toolName: event.toolName,
      inputSummary,
      status: 'error',
      errorMessage: event.message || 'Unknown error',
      durationMs: event.durationMs,
      expanded: existing?.expanded ?? false,
    };
  }

  return {
    id,
    toolName: event.toolName,
    inputSummary,
    status: 'ok',
    output: event.output,
    durationMs: event.durationMs,
    expanded: existing?.expanded ?? false,
  };
}

export function renderToolCallBlock(
  state: ToolCallRenderState,
  options: RenderToolCallOptions = {},
): ToolCallRenderResult {
  const terminalWidth = Math.max(40, options.terminalWidth ?? process.stdout.columns ?? 80);
  const indent = ' '.repeat(options.indent ?? 2);
  const boxWidth = Math.max(32, Math.min(terminalWidth - indent.length, 96));
  const innerWidth = boxWidth - 4;
  const border = Colors.subtle;
  const titleColor = Colors.cyan;
  const muted = Colors.muted;
  const dim = Colors.dim;
  const lines: string[] = [];

  const displayName = getToolDisplayName(state.toolName);
  lines.push(`${indent}${buildTitleRow(displayName, boxWidth, border, titleColor)}`);

  if (state.inputSummary) {
    lines.push(`${indent}${buildBoxRow(state.inputSummary, innerWidth, border)}`);
  }

  if (state.status === 'running') {
    const spinner = options.spinnerFrame ?? Icons.spinner[0];
    lines.push(`${indent}${buildBoxRow(`${dim}${spinner} Running...${Colors.reset}`, innerWidth, border)}`);
  } else if (state.status === 'error') {
    const duration = formatDuration(state.durationMs);
    const statusText = `${Colors.red}${Icons.cross}${Colors.reset} ${state.errorMessage || 'Error'}${duration ? `${dim} · ${duration}${Colors.reset}` : ''}`;
    lines.push(`${indent}${buildBoxRow(statusText, innerWidth, border)}`);
  } else {
    const summary = getToolResultSummary(state.toolName, state.output || '');
    const duration = formatDuration(state.durationMs);
    const statusText = `${Colors.green}${Icons.check}${Colors.reset} ${summary}${duration ? `${dim} · ${duration}${Colors.reset}` : ''}`;
    lines.push(`${indent}${buildBoxRow(statusText, innerWidth, border)}`);

    if (state.expanded && state.output?.trim()) {
      for (const bodyLine of getToolOutputBodyLines(state.toolName, state.output)) {
        lines.push(`${indent}${buildBoxRow(`${muted}${bodyLine}${Colors.reset}`, innerWidth, border)}`);
      }
    }
  }

  lines.push(`${indent}${border}${Box.bottomLeft}${Box.horizontal.repeat(boxWidth - 2)}${Box.bottomRight}${Colors.reset}`);

  const content = `${lines.join('\r\n')}\r\n`;
  return {
    content,
    lineCount: countLines(stripAnsi(content)),
  };
}
