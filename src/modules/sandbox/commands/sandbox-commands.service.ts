import { Injectable } from '@nestjs/common';
import { SnapshotService } from '../../snapshots/services/snapshot.service';
import { SandboxManagerService } from '../services/sandbox-manager.service';

@Injectable()
export class SandboxCommandsService {
  constructor(
    private readonly manager: SandboxManagerService,
    private readonly snapshots: SnapshotService,
  ) {}

  async cmdSandbox(args: string[]): Promise<void> {
    const subcommand = (args[0] ?? 'help').toLowerCase();
    switch (subcommand) {
    case 'rollback':
      await this.rollback(args[1]);
      return;
    case 'checkpoints':
    case 'list':
      this.list();
      return;
    case 'help':
    default:
      this.printHelp();
    }
  }

  private async rollback(runId?: string): Promise<void> {
    if (!runId) {
      process.stdout.write('Usage: /sandbox rollback <runId>\n');
      return;
    }
    const restored = await this.manager.rollback(runId, process.cwd());
    process.stdout.write(restored
      ? `Sandbox checkpoint restored: ${runId}\n`
      : `No restorable sandbox checkpoint found for: ${runId}\n`);
  }

  private list(): void {
    const checkpoints = this.snapshots.listCheckpoints();
    if (checkpoints.length === 0) {
      process.stdout.write('No sandbox checkpoints found.\n');
      return;
    }

    process.stdout.write('Sandbox checkpoints:\n');
    for (const checkpoint of checkpoints.slice(0, 20)) {
      process.stdout.write(`- ${checkpoint.checkpointId} files=${checkpoint.files.length} at=${new Date(checkpoint.timestamp).toISOString()}\n`);
    }
  }

  private printHelp(): void {
    process.stdout.write([
      'Sandbox commands:',
      '- /sandbox checkpoints',
      '- /sandbox rollback <runId>',
      '',
    ].join('\n'));
  }
}
