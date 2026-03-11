import { Module } from '@nestjs/common';
import { ReplService } from './services/repl.service';
import { WelcomeScreenService } from './services/welcome-screen.service';
import { ReplCommandsService } from './services/commands/repl-commands.service';
import { GitCommandsService } from './services/commands/git-commands.service';
import { AgentCommandsService } from './services/commands/agent-commands.service';
import { McpCommandsService } from './services/commands/mcp-commands.service';
import { ConfigCommandsService } from '../config/services/config-commands.service';
import { ProjectCommandsService } from './services/commands/project-commands.service';
import { SnapshotCommandsService } from './services/commands/snapshot-commands.service';
import { StatsCommandsService } from './services/commands/stats-commands.service';
import { ReplayCommandsService } from './services/commands/replay-commands.service';
import { VaultCommandsService } from './services/commands/vault-commands.service';
import { CoreModule } from '../core/core.module';
import { ToolsModule } from '../tools/tools.module';
import { GitModule } from '../git/git.module';
import { AgentsModule } from '../agents/agents.module';
import { SkillsModule } from '../skills/skills.module';
import { McpModule } from '../mcp/mcp.module';
import { ProjectModule } from '../project/project.module';
import { MemoryModule } from '../memory/memory.module';
import { ConfigModule } from '../config';
import { KanbanModule } from '../kanban/kanban.module';
import { RemoteModule } from '../remote/remote.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SnapshotModule } from '../snapshots/snapshot.module';
import { StatsModule } from '../stats/stats.module';
import { ReplayModule } from '../replay/replay.module';
import { VaultModule } from '../vault/vault.module';

@Module({
  imports: [
    ConfigModule,
    CoreModule,
    ToolsModule,
    GitModule,
    AgentsModule,
    SkillsModule,
    McpModule,
    ProjectModule,
    MemoryModule,
    KanbanModule,
    RemoteModule,
    PermissionsModule,
    SnapshotModule,
    StatsModule,
    ReplayModule,
    VaultModule,
  ],
  providers: [
    ReplService,
    WelcomeScreenService,
    ReplCommandsService,
    GitCommandsService,
    AgentCommandsService,
    McpCommandsService,
    ConfigCommandsService,
    ProjectCommandsService,
    SnapshotCommandsService,
    StatsCommandsService,
    ReplayCommandsService,
    VaultCommandsService,
  ],
  exports: [ReplService],
})
export class ReplModule { }
