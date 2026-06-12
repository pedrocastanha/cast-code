import { Injectable, Optional } from '@nestjs/common';
import { ReplayService, ReplayEntry, ReplaySession, ReplaySummary } from '../../../replay/services/replay.service';
import { DeepAgentService } from '../../../core/services/deep-agent.service';
import { CommandUiService } from '../command-ui.service';
import { colorize } from '../../utils/theme';
import type { ISmartInput } from '../smart-input';

@Injectable()
export class ResumeCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly replayService: ReplayService,
    @Optional() private readonly deepAgent?: DeepAgentService,
  ) {}

  async cmdResume(args: string[], smartInput: ISmartInput): Promise<void> {
    const sessions = this.replayService.list();
    if (sessions.length === 0) {
      process.stdout.write(this.ui.warning('No saved sessions found.'));
      return;
    }

    const query = args.join(' ').trim().toLowerCase();
    const candidates: ReplaySummary[] = query
      ? sessions.filter((s) => s.name.toLowerCase().includes(query))
      : sessions;

    if (candidates.length === 0) {
      process.stdout.write(this.ui.warning(`No session matches: ${query}`));
      return;
    }

    let chosen: ReplaySummary | undefined;
    if (query && candidates.length === 1) {
      chosen = candidates[0];
    } else {
      const key = await smartInput.askChoice('Resume a session', candidates.map((s) => ({
        key: s.fileName,
        label: s.name,
        description: `${s.project} · ${s.model} · ${s.date} · ${s.messages} msgs`,
      })));
      if (!key) return; // cancelled
      chosen = candidates.find((s) => s.fileName === key);
    }
    if (!chosen) return;

    const sessionName = chosen.fileName.replace(/\.json$/, '');
    const session = this.replayService.getSession(sessionName);
    if (!session) {
      process.stdout.write(this.ui.error(`Could not load session: ${chosen.name}`));
      return;
    }

    this.renderTranscript(session);

    const restored = this.deepAgent?.restoreConversation?.(
      session.entries.map((e: ReplayEntry) => ({ role: e.role, content: e.content, toolName: e.toolName })),
    ) ?? 0;

    process.stdout.write(this.ui.success(
      `Session resumed: ${session.name ?? session.id} (${restored} messages restored)`,
    ));
  }

  private renderTranscript(session: ReplaySession): void {
    const lines = session.entries.map((entry) => {
      const first = this.firstLine(entry.content);
      if (entry.role === 'user') return `${colorize('›', 'cyan')} ${first}`;
      if (entry.role === 'tool') return `  ${colorize(`[tool ${entry.toolName ?? '?'}]`, 'muted')} ${first}`;
      return `  ${first}`;
    });

    process.stdout.write(this.ui.panel({
      title: 'Resumed session',
      subtitle: session.name ?? session.id,
      sections: [{ lines }],
      footer: `${session.entries.length} entries · ${new Date(session.createdAt).toLocaleString()}`,
    }));
  }

  private firstLine(text: string): string {
    const line = (text ?? '').split('\n')[0];
    return line.length > 100 ? `${line.slice(0, 99)}…` : line;
  }
}
