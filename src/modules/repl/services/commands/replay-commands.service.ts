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
    const parsed = this.parseReplayArgs(parts.slice(1));
    const name = parsed.name;

    switch (sub) {
    case 'save':
      if (!name) { process.stdout.write(this.ui.error('Usage: /replay save <name>')); return; }
      this.replayService.save(name);
      process.stdout.write(this.ui.success(`Session saved as "${name}".`));
      break;

    case 'show':
      if (!name) { process.stdout.write(this.ui.error('Usage: /replay show <name>')); return; }
      this.showSession(name, parsed.flags);
      break;

    case 'export':
      if (!name) { process.stdout.write(this.ui.error('Usage: /replay export <name> --format json|jsonl')); return; }
      this.exportSession(name, parsed.flags.format === 'json' ? 'json' : 'jsonl');
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

  private showSession(name: string, flags: ReplayFlags = {}): void {
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

    const sections: any[] = [
      {
        title: 'Details',
        rows: [
          { label: 'Project', value: path.basename(session.project || process.cwd()) },
          { label: 'Model', value: session.model || 'unknown' },
          { label: 'Date', value: new Date(session.createdAt).toLocaleString() },
          { label: 'Entries', value: session.entries.length.toString() },
          { label: 'Trace', value: session.trace ? `${session.trace.events} events` : colorize('not recorded', 'muted') },
        ],
      },
      {
        title: 'Preview',
        lines,
      },
    ];

    if (flags.timeline || flags.agents || flags.skills || flags.tools || flags.errors) {
      const timeline = this.replayService.getTimeline(name);
      if (timeline.warning) {
        sections.push({ title: 'Timeline', lines: [colorize(timeline.warning, 'warning')] });
      } else {
        const filtered = timeline.events.filter((event) => {
          if (flags.agents && !event.type.startsWith('agent.')) return false;
          if (flags.skills && !event.type.startsWith('skill.')) return false;
          if (flags.tools && !event.type.startsWith('tool.')) return false;
          if (flags.errors && !(event.type.startsWith('error.') || event.type.endsWith('.failed') || event.type.endsWith('.denied'))) return false;
          return true;
        });
        sections.push({
          title: 'Timeline',
          lines: filtered.length > 0
            ? filtered.slice(0, 50).map((event) => `${colorize(event.type, 'cyan')}  ${colorize(event.runId, 'muted')}`)
            : [colorize('No matching trace events.', 'muted')],
        });
      }
    }

    process.stdout.write(this.ui.panel({
      title: 'Replay',
      subtitle: session.name || name,
      sections,
    }));
  }

  private exportSession(name: string, format: 'json' | 'jsonl'): void {
    const result = this.replayService.exportTraceToFile(name, format);
    if (result.events === 0) {
      process.stdout.write(this.ui.warning(`No trace events exported for "${name}".`));
      return;
    }
    process.stdout.write(this.ui.success(`Exported ${result.events} events as ${format}: ${result.filePath}`));
  }

  private parseReplayArgs(args: string[]): { name: string; flags: ReplayFlags } {
    const flags: ReplayFlags = {};
    const nameParts: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg === '--timeline') flags.timeline = true;
      else if (arg === '--agents') flags.agents = true;
      else if (arg === '--skills') flags.skills = true;
      else if (arg === '--tools') flags.tools = true;
      else if (arg === '--errors') flags.errors = true;
      else if (arg === '--format') {
        flags.format = args[i + 1] === 'json' ? 'json' : 'jsonl';
        i += 1;
      } else if (arg === '--agent') {
        flags.agent = args[i + 1];
        i += 1;
      } else {
        nameParts.push(arg);
      }
    }
    return { name: nameParts.join(' ').trim(), flags };
  }
}

interface ReplayFlags {
  timeline?: boolean;
  agents?: boolean;
  skills?: boolean;
  tools?: boolean;
  errors?: boolean;
  agent?: string;
  format?: 'json' | 'jsonl';
}
