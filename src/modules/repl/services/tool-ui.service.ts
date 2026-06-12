import { Icons } from '../utils/theme';
import { getToolSpinnerLabel } from '../../../ui/cast-design/tool-call-details';
import {
  buildToolCallRenderState,
  renderToolCallBlock,
} from '../../../ui/cast-design/tool-call-renderer';
import type { ToolCallRenderState, ToolUiEvent } from '../../../ui/cast-design/tool-call.types';
import { renderDiffLines } from '../../../ui/cast-design/diff-renderer';

interface ToolCallRecord extends ToolCallRenderState {
  renderedLineCount: number;
  fullOutput?: string;
  input?: unknown;
}

export interface ToolUiOutput {
  write: (text: string) => void;
  rewrite: (lineCount: number, content: string) => void;
  getTerminalWidth: () => number;
}

export class ToolUiService {
  private readonly calls: ToolCallRecord[] = [];
  private spinnerFrameIndex = 0;

  constructor(private readonly output: ToolUiOutput) {}

  reset(): void {
    this.calls.length = 0;
  }

  hasExpandable(): boolean {
    const last = this.calls[this.calls.length - 1];
    return Boolean(last && last.status !== 'running' && last.fullOutput?.trim() && !last.expanded);
  }

  getSpinnerLabel(event: ToolUiEvent): string | null {
    if (event.type === 'started') {
      return getToolSpinnerLabel(event.toolName);
    }
    return null;
  }

  handle(event: ToolUiEvent): void {
    const callId = event.callId ?? `${event.toolName}:${this.calls.length + 1}`;

    if (event.type === 'started') {
      const state = buildToolCallRenderState({ ...event, callId });
      const rendered = renderToolCallBlock(state, {
        terminalWidth: this.output.getTerminalWidth(),
        spinnerFrame: Icons.spinner[this.spinnerFrameIndex % Icons.spinner.length],
      });
      this.calls.push({
        ...state,
        renderedLineCount: rendered.lineCount,
        input: event.input,
      });
      this.output.write(rendered.content);
      return;
    }

    const index = this.findCallIndex(callId, event.toolName);
    const existing = index >= 0 ? this.calls[index] : undefined;
    const state = buildToolCallRenderState(
      {
        type: event.type,
        toolName: event.toolName,
        callId: existing?.id ?? callId,
        output: event.type === 'completed' ? event.output : undefined,
        durationMs: event.durationMs,
        message: event.type === 'failed' ? event.message : undefined,
      },
      existing,
    );

    const rendered = renderToolCallBlock(state, {
      terminalWidth: this.output.getTerminalWidth(),
    });

    if (existing && existing.renderedLineCount > 0) {
      this.output.rewrite(existing.renderedLineCount, rendered.content);
    } else {
      this.output.write(rendered.content);
    }

    const record: ToolCallRecord = {
      ...state,
      fullOutput: event.type === 'completed' ? event.output : existing?.fullOutput,
      renderedLineCount: rendered.lineCount,
      input: existing?.input,
    };

    if (index >= 0) {
      this.calls[index] = record;
    } else {
      this.calls.push(record);
    }

    if (event.type === 'completed' && isFileMutationTool(event.toolName)) {
      const diffContent = buildDiffContent(event.toolName, existing?.input);
      if (diffContent) {
        this.output.write(diffContent);
      }
    }
  }

  expandLast(): boolean {
    for (let index = this.calls.length - 1; index >= 0; index -= 1) {
      const call = this.calls[index];
      if (call.status === 'running' || !call.fullOutput?.trim() || call.expanded) {
        continue;
      }

      const expandedState: ToolCallRecord = {
        ...call,
        expanded: true,
        output: call.fullOutput,
      };
      const rendered = renderToolCallBlock(expandedState, {
        terminalWidth: this.output.getTerminalWidth(),
      });
      this.output.rewrite(call.renderedLineCount, rendered.content);
      this.calls[index] = {
        ...expandedState,
        renderedLineCount: rendered.lineCount,
      };
      return true;
    }
    return false;
  }

  private findCallIndex(callId: string, toolName: string): number {
    const byId = this.calls.findIndex((call) => call.id === callId);
    if (byId >= 0) return byId;

    for (let index = this.calls.length - 1; index >= 0; index -= 1) {
      if (this.calls[index].toolName === toolName && this.calls[index].status === 'running') {
        return index;
      }
    }
    return -1;
  }
}

function isFileMutationTool(toolName: string): boolean {
  return toolName === 'edit_file' || toolName === 'write_file';
}

function buildDiffContent(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  let oldText: string;
  let newText: string;

  if (toolName === 'edit_file') {
    if (typeof record.old_string !== 'string' || typeof record.new_string !== 'string') return null;
    oldText = record.old_string;
    newText = record.new_string;
  } else {
    if (typeof record.content !== 'string') return null;
    oldText = '';
    newText = record.content;
  }

  const lines = renderDiffLines(oldText, newText, 40);
  if (lines.length === 0) return null;
  return lines.map((l) => `    ${l}`).join('\r\n') + '\r\n';
}
