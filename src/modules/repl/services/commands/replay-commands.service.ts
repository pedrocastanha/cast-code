import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { ReplayService } from '../../../replay/services/replay.service';
import { colorize } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';

@Injectable()
export class ReplayCommandsService {
  private readonly ui = new CommandUiService();

  constructor(private readonly replayService: ReplayService) {}

  cmdReplay(args: string): void {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];
    const name = parts.slice(1).join(' ');

    switch (sub) {
    case 'save':
      if (!name) { process.stdout.write(this.ui.error('Usage: /replay save <name>')); return; }
      this.replayService.save(name);
      process.stdout.write(this.ui.success(`Session saved as "${name}".`));
      break;

    case 'show':
      if (!name) { process.stdout.write(this.ui.error('Usage: /replay show <name>')); return; }
      this.showSession(name);
      break;

    case 'list':
    case '':
    case undefined:
      this.listSessions();
      break;

    default:
      process.stdout.write(this.ui.error('Usage: /replay [save <name>] [list] [show <name>]'));
    }
  }

  private listSessions(): void {
    const sessions = this.replayService.list();
    if (sessions.length === 0) {
      process.stdout.write(this.ui.warning('No saved sessions.'));
      return;
    }
    process.stdout.write(this.ui.panel({
      title: 'Saved Sessions',
      subtitle: `${sessions.length} available`,
      sections: [
        {
          lines: sessions.map((s) =>
            `${colorize(s.name, 'cyan')}  ${colorize(s.date, 'muted')}  ${colorize(s.project, 'subtle')}  ${colorize(`${s.messages} msgs`, 'muted')}`,
          ),
        },
      ],
      footer: 'Use /replay show <name> to view a session.',
    }));
  }

  private showSession(name: string): void {
    const session = this.replayService.getSession(name);
    if (!session) {
      process.stdout.write(this.ui.error(`Session "${name}" not found.`));
      return;
    }

    const displayEntries = session.entries.slice(0, 25);
    const lines = displayEntries.map((e) => {
      const label =
        e.role === 'user' ? colorize('You', 'accent') :
          e.role === 'tool' ? colorize(`[${e.toolName || 'tool'}]`, 'muted') :
            colorize('Cast', 'primary');
      const preview = e.content.replace(/\n/g, ' ').slice(0, 110);
      return `${label}  ${preview}${e.content.length > 110 ? '...' : ''}`;
    });

    if (session.entries.length > 25) {
      lines.push(colorize(`... and ${session.entries.length - 25} more entries`, 'muted'));
    }

    process.stdout.write(this.ui.panel({
      title: 'Replay',
      subtitle: session.name || name,
      sections: [
        {
          title: 'Details',
          rows: [
            { label: 'Project', value: path.basename(session.project || process.cwd()) },
            { label: 'Model', value: session.model || 'unknown' },
            { label: 'Date', value: new Date(session.createdAt).toLocaleString() },
            { label: 'Entries', value: session.entries.length.toString() },
          ],
        },
        {
          title: 'Preview',
          lines,
        },
      ],
    }));
  }
}
