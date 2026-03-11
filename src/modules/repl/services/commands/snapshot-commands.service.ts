import { Injectable } from '@nestjs/common';
import { SnapshotService } from '../../../snapshots/services/snapshot.service';
import { colorize, UI, Icons } from '../../utils/theme';
import * as path from 'path';

@Injectable()
export class SnapshotCommandsService {
  constructor(private readonly snapshotService: SnapshotService) {}

  async cmdRollback(args: string): Promise<void> {
    const filePath = args.trim();

    if (!filePath) {
      const snapshots = this.snapshotService.listSnapshots();
      if (snapshots.length === 0) {
        console.log(UI.warning('No snapshots in current session.'));
        return;
      }
      console.log(UI.header('Snapshots', '📸'));
      snapshots.forEach(s => {
        const rel = path.relative(process.cwd(), s.filePath);
        const time = new Date(s.timestamp).toLocaleTimeString();
        console.log(UI.item(`${colorize(rel, 'cyan')}  ${colorize(time, 'muted')}`));
      });
      console.log(colorize('\nRun /rollback <file> to restore.', 'muted'));
      return;
    }

    const restored = this.snapshotService.rollback(filePath);
    if (restored) {
      console.log(UI.success(`Restored: ${colorize(filePath, 'cyan')}`));
    } else {
      console.log(UI.error(`No snapshot found for: ${colorize(filePath, 'cyan')}`));
      console.log(colorize('Run /rollback without args to list available snapshots.', 'muted'));
    }
  }
}
