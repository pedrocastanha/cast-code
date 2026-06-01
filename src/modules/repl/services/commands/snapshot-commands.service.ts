import { Injectable } from '@nestjs/common';
import { SnapshotService } from '../../../snapshots/services/snapshot.service';
import { colorize } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';
import * as path from 'path';

@Injectable()
export class SnapshotCommandsService {
  private readonly ui = new CommandUiService();

  constructor(private readonly snapshotService: SnapshotService) {}

  async cmdRollback(args: string): Promise<void> {
    const filePath = args.trim();

    if (!filePath) {
      const snapshots = this.snapshotService.listSnapshots();
      if (snapshots.length === 0) {
        process.stdout.write(this.ui.warning('No snapshots in current session.'));
        return;
      }
      process.stdout.write(this.ui.panel({
        title: 'Snapshots',
        subtitle: `${snapshots.length} available`,
        sections: [
          {
            lines: snapshots.map((s) => {
              const rel = path.relative(process.cwd(), s.filePath);
              const time = new Date(s.timestamp).toLocaleTimeString();
              return `${colorize(rel, 'cyan')}  ${colorize(time, 'muted')}`;
            }),
          },
        ],
        footer: 'Run /rollback <file> to restore.',
      }));
      return;
    }

    const restored = this.snapshotService.rollback(filePath);
    if (restored) {
      process.stdout.write(this.ui.success(`Restored: ${filePath}`));
    } else {
      process.stdout.write(this.ui.error(`No snapshot found for: ${filePath}. Run /rollback to list snapshots.`));
    }
  }
}
