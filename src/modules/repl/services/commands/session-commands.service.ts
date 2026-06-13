import { Injectable, Optional } from '@nestjs/common';
import { LocalSessionStoreService } from '../../../state/services/local-session-store.service';
import type { LocalMessage, LocalSessionSummary, LocalToolCall } from '../../../state/types/state.types';
import { CommandUiService } from '../command-ui.service';
import { colorize } from '../../utils/theme';

@Injectable()
export class SessionsCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    @Optional()
    private readonly store?: LocalSessionStoreService,
  ) {}

  async cmdSessions(args: string[]): Promise<void> {
    if (!this.store) {
      process.stdout.write(this.ui.error('Local session storage is not available in this runtime.'));
      return;
    }

    const subcommand = (args[0] ?? 'list').toLowerCase();
    switch (subcommand) {
    case 'list':
    case 'ls':
      await this.list();
      return;
    case 'search':
    case 'find':
      await this.search(args.slice(1).join(' '));
      return;
    case 'show':
    case 'inspect':
      await this.show(args.slice(1).join(' '));
      return;
    case 'help':
    default:
      this.printHelp();
    }
  }

  private async list(): Promise<void> {
    const sessions = await this.store!.listSessions(process.cwd(), 20);
    this.printSessions('Sessions', sessions, '/resume opens the interactive session picker');
  }

  private async search(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) {
      process.stdout.write(this.ui.error('Usage: /sessions search <query>'));
      return;
    }
    const sessions = await this.store!.searchSessions(trimmed, process.cwd(), 20);
    this.printSessions('Sessions', sessions, '/resume opens the interactive session picker');
  }

  private async show(selector: string): Promise<void> {
    const trimmed = selector.trim();
    if (!trimmed) {
      process.stdout.write(this.ui.error('Usage: /sessions show <session-id-or-search>'));
      return;
    }

    const session = await this.store!.findSession(trimmed, process.cwd());
    if (!session) {
      process.stdout.write(this.ui.warning(`No local session found for: ${trimmed}`));
      return;
    }

    const messages = await this.store!.listSessionMessages(session.id, 12);
    const tools = await this.store!.listSessionToolCalls(session.id, 8);
    process.stdout.write(this.ui.panel({
      title: 'Session',
      subtitle: session.id,
      sections: [
        {
          title: 'Details',
          rows: [
            { label: 'Project', value: this.compactPath(session.projectRoot) },
            { label: 'Model', value: session.model ?? 'unknown' },
            { label: 'Started', value: this.formatDate(session.startedAt) },
            { label: 'Ended', value: this.formatDate(session.endedAt) },
            { label: 'Messages', value: String(session.messageCount) },
            { label: 'Tool calls', value: String(session.toolCallCount) },
          ],
        },
        {
          title: 'Recent messages',
          lines: messages.length > 0
            ? messages.map((message) => this.formatMessageLine(message))
            : [colorize('No messages stored.', 'muted')],
        },
        {
          title: 'Recent tools',
          lines: tools.length > 0
            ? tools.map((tool) => this.formatToolLine(tool))
            : [colorize('No tool calls stored.', 'muted')],
        },
      ],
      footer: '/resume opens the interactive session picker',
    }));
  }

  private printSessions(title: string, sessions: LocalSessionSummary[], footer: string): void {
    if (sessions.length === 0) {
      process.stdout.write(this.ui.panel({
        title,
        subtitle: '0 found',
        sections: [{ lines: [colorize('No local sessions found.', 'muted')] }],
        footer: '/sessions search <query> searches local memory-backed sessions',
      }));
      return;
    }

    process.stdout.write(this.ui.panel({
      title,
      subtitle: `${sessions.length} found`,
      sections: [{
        lines: sessions.map((session) => [
          colorize(session.id, 'cyan'),
          colorize(this.truncate(session.preview ?? '', 72), 'muted'),
          `${session.messageCount} msg`,
          `${session.toolCallCount} tools`,
          this.formatDate(session.lastActivityAt),
        ].filter(Boolean).join('  ')),
      }],
      footer,
    }));
  }

  private formatMessageLine(message: LocalMessage): string {
    const body = message.redactedContent ?? message.contentPreview ?? '';
    return `${colorize(message.role, 'cyan')}  ${colorize(this.formatDate(message.createdAt), 'subtle')}  ${this.truncate(body.replace(/\s+/g, ' '), 110)}`;
  }

  private formatToolLine(tool: LocalToolCall): string {
    const output = tool.outputPreview ? `  ${colorize(this.truncate(tool.outputPreview.replace(/\s+/g, ' '), 90), 'muted')}` : '';
    return `${colorize(tool.toolName, 'cyan')}  ${tool.status}${output}`;
  }

  private printHelp(): void {
    process.stdout.write(this.ui.panel({
      title: 'Session commands',
      sections: [{
        lines: [
          '/sessions                         list recent local sessions for this project',
          '/sessions search <query>          search saved session messages and tool calls',
          '/sessions show <id-or-query>      inspect one saved session',
          '/resume                           open the interactive session picker',
        ],
      }],
      footer: 'Sessions are stored locally in the Cast state database.',
    }));
  }

  private compactPath(value: string): string {
    const home = process.env.HOME;
    return home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
  }

  private formatDate(value?: string): string {
    if (!value) {
      return 'unknown';
    }
    return value.replace('T', ' ').replace('.000Z', 'Z');
  }

  private truncate(value: string, max: number): string {
    if (value.length <= max) {
      return value;
    }
    return `${value.slice(0, Math.max(0, max - 3))}...`;
  }
}
