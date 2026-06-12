import { Colors, Icons } from '../../modules/repl/utils/theme';
import { truncateVisible } from '../cast-design/cli-renderer';
import { formatDuration } from '../cast-design/tool-call-details';
import type { AgentUiEvent } from '../cast-design/tool-call.types';
import type { LiveBlock } from './compositor';

interface AgentEntry {
  agentId: string;
  agentName: string;
  task: string;
  currentTool?: string;
  tokens?: number;
  startedAt: number;
}

function formatTokens(tokens?: number): string {
  if (tokens === undefined) return '';
  if (tokens < 1000) return `${tokens} tk`;
  return `${(tokens / 1000).toFixed(1)}k tk`;
}

export class AgentTreeBlock implements LiveBlock {
  readonly id = 'agent-tree';
  private agents = new Map<string, AgentEntry>();
  private spinnerFrame = 0;

  constructor(private readonly scrollOut: (content: string) => void) {}

  handle(event: AgentUiEvent): void {
    if (event.type === 'spawned') {
      this.agents.set(event.agentId, {
        agentId: event.agentId,
        agentName: event.agentName,
        task: event.task,
        startedAt: Date.now(),
      });
      return;
    }

    const entry = this.agents.get(event.agentId);
    if (!entry) return;

    if (event.type === 'progress') {
      if (event.currentTool !== undefined) entry.currentTool = event.currentTool;
      if (event.tokens !== undefined) entry.tokens = event.tokens;
      return;
    }

    this.agents.delete(event.agentId);

    if (event.type === 'completed') {
      const meta = [
        `done in ${formatDuration(event.durationMs) || '0ms'}`,
        formatTokens(event.tokens ?? entry.tokens),
      ].filter(Boolean).join(' · ');
      let line = `  ${Colors.green}${Icons.check}${Colors.reset} ${Colors.bold}${entry.agentName}${Colors.reset} ${Colors.dim}— ${meta}${Colors.reset}\r\n`;
      if (event.summary) {
        line += `    ${Colors.dim}└ ${event.summary.split('\n')[0]}${Colors.reset}\r\n`;
      }
      this.scrollOut(line);
      return;
    }

    if (event.type === 'failed') {
      const firstLine = event.error.split('\n')[0];
      this.scrollOut(
        `  ${Colors.red}${Icons.cross}${Colors.reset} ${Colors.bold}${entry.agentName}${Colors.reset} ${Colors.dim}— failed after ${formatDuration(event.durationMs) || '0ms'}${Colors.reset}\r\n`
        + `    ${Colors.red}└ ${firstLine}${Colors.reset}\r\n`,
      );
    }
  }

  setCurrentTool(agentId: string, tool: string): void {
    const entry = this.agents.get(agentId);
    if (entry) entry.currentTool = tool;
  }

  clearAll(): void {
    this.agents.clear();
  }

  tick(): void {
    this.spinnerFrame = (this.spinnerFrame + 1) % Icons.spinner.length;
  }

  isAnimated(): boolean {
    return this.agents.size > 0;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const spinner = Icons.spinner[this.spinnerFrame];

    for (const entry of this.agents.values()) {
      const elapsed = formatDuration(Date.now() - entry.startedAt) || '0s';
      const title = `${Colors.primary}●${Colors.reset} ${Colors.bold}${entry.agentName}${Colors.reset} ${Colors.dim}— ${entry.task}${Colors.reset}`;
      lines.push(truncateVisible(title, width));

      const meta = [
        `${spinner} Running ${elapsed}`,
        formatTokens(entry.tokens),
      ].filter(Boolean).join(' · ');
      lines.push(`  ${Colors.dim}${truncateVisible(meta, Math.max(1, width - 2))}${Colors.reset}`);

      if (entry.currentTool) {
        lines.push(`  ${Colors.muted}└ ${truncateVisible(entry.currentTool, Math.max(1, width - 4))}${Colors.reset}`);
      }
    }

    if (lines.length > 0) lines.push('');
    return lines;
  }
}
