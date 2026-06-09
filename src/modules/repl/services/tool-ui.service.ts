import { Icons } from '../utils/theme';
import { getToolSpinnerLabel } from '../../../ui/cast-design/tool-call-details';
import {
  buildToolCallRenderState,
  renderToolCallBlock,
} from '../../../ui/cast-design/tool-call-renderer';
import type { ToolCallRenderState, ToolUiEvent } from '../../../ui/cast-design/tool-call.types';

interface ToolCallRecord extends ToolCallRenderState {
  renderedLineCount: number;
  fullOutput?: string;
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
    };

    if (index >= 0) {
      this.calls[index] = record;
    } else {
      this.calls.push(record);
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
