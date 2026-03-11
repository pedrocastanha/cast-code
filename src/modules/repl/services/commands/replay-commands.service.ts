import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { ReplayService } from '../../../replay/services/replay.service';
import { colorize, UI } from '../../utils/theme';

@Injectable()
export class ReplayCommandsService {
  constructor(private readonly replayService: ReplayService) {}

  cmdReplay(args: string): void {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0];
    const name = parts.slice(1).join(' ');

    switch (sub) {
      case 'save':
        if (!name) { console.log(UI.error('Usage: /replay save <name>')); return; }
        this.replayService.save(name);
        console.log(UI.success(`Session saved as "${name}".`));
        break;

      case 'show':
        if (!name) { console.log(UI.error('Usage: /replay show <name>')); return; }
        this.showSession(name);
        break;

      case 'list':
      case '':
      case undefined:
        this.listSessions();
        break;

      default:
        console.log(UI.error('Usage: /replay [save <name>] [list] [show <name>]'));
    }
  }

  private listSessions(): void {
    const sessions = this.replayService.list();
    if (sessions.length === 0) {
      console.log(UI.warning('No saved sessions.'));
      return;
    }
    console.log(UI.header('Saved Sessions', '▶'));
    sessions.forEach(s => {
      console.log(UI.item(
        `${colorize(s.name, 'cyan')}  ` +
        `${colorize(s.date, 'muted')}  ` +
        `${colorize(s.project, 'subtle')}  ` +
        `${colorize(s.messages + ' msgs', 'muted')}`,
      ));
    });
    console.log(colorize('\nUse /replay show <name> to view a session.', 'muted'));
  }

  private showSession(name: string): void {
    const session = this.replayService.getSession(name);
    if (!session) {
      console.log(UI.error(`Session "${name}" not found.`));
      return;
    }

    console.log(UI.header(`Replay: ${session.name || name}`, '▶'));
    console.log(UI.kv('Project', path.basename(session.project || process.cwd()), 10));
    console.log(UI.kv('Model', session.model || 'unknown', 10));
    console.log(UI.kv('Date', new Date(session.createdAt).toLocaleString(), 10));
    console.log(UI.kv('Entries', session.entries.length.toString(), 10));
    console.log('');

    const displayEntries = session.entries.slice(0, 25);
    displayEntries.forEach(e => {
      const label =
        e.role === 'user' ? colorize('You', 'accent') :
        e.role === 'tool' ? colorize(`[${e.toolName || 'tool'}]`, 'muted') :
        colorize('Cast', 'primary');
      const preview = e.content.replace(/\n/g, ' ').slice(0, 110);
      console.log(`${label}  ${preview}${e.content.length > 110 ? '…' : ''}`);
    });

    if (session.entries.length > 25) {
      console.log(colorize(`\n... and ${session.entries.length - 25} more entries`, 'muted'));
    }
  }
}
