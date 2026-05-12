import { Module } from '@nestjs/common';
import { SnapshotModule } from '../snapshots/snapshot.module';
import { StateModule } from '../state/state.module';
import { SandboxCommandsService } from './commands/sandbox-commands.service';
import { DockerSandboxService } from './services/docker-sandbox.service';
import { GitWorktreeSandboxService } from './services/git-worktree-sandbox.service';
import { NoopSandboxService } from './services/noop-sandbox.service';
import { SandboxArtifactService } from './services/sandbox-artifact.service';
import { SandboxCommandRunnerService } from './services/sandbox-command-runner.service';
import { SandboxManagerService } from './services/sandbox-manager.service';
import { SnapshotSandboxService } from './services/snapshot-sandbox.service';

@Module({
  imports: [SnapshotModule, StateModule],
  providers: [
    SandboxCommandsService,
    DockerSandboxService,
    GitWorktreeSandboxService,
    NoopSandboxService,
    SandboxArtifactService,
    SandboxCommandRunnerService,
    SandboxManagerService,
    SnapshotSandboxService,
  ],
  exports: [
    SandboxCommandsService,
    DockerSandboxService,
    GitWorktreeSandboxService,
    NoopSandboxService,
    SandboxArtifactService,
    SandboxCommandRunnerService,
    SandboxManagerService,
    SnapshotSandboxService,
  ],
})
export class SandboxModule {}
