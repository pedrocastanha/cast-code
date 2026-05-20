import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { CoreModule } from './modules/core/core.module';
import { ReplModule } from './modules/repl/repl.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { MemoryModule } from './modules/memory/memory.module';
import { MentionsModule } from './modules/mentions/mentions.module';
import { GitModule } from './modules/git/git.module';
import { ConfigModule } from './modules/config';
import { I18nModule } from './modules/i18n/i18n.module';
import { SnapshotModule } from './modules/snapshots/snapshot.module';
import { StatsModule } from './modules/stats/stats.module';
import { ReplayModule } from './modules/replay/replay.module';
import { VaultModule } from './modules/vault/vault.module';
import { DiffModule } from './modules/diff/diff.module';
import { WatcherModule } from './modules/watcher/watcher.module';
import { PlatformModule } from './modules/platform/platform.module';
import { EnvironmentModule } from './modules/environments/environment.module';
import { SkillsImportModule } from './modules/skills-import/skills-import.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SandboxModule } from './modules/sandbox/sandbox.module';
import { TraceModule } from './modules/trace/trace.module';
import { BridgeModule } from './modules/bridge/bridge.module';

@Module({
  imports: [
    I18nModule,
    ConfigModule,
    CommonModule,
    CoreModule,
    ReplModule,
    PermissionsModule,
    TasksModule,
    MemoryModule,
    MentionsModule,
    GitModule,
    SnapshotModule,
    StatsModule,
    ReplayModule,
    VaultModule,
    DiffModule,
    WatcherModule,
    PlatformModule,
    EnvironmentModule,
    SkillsImportModule,
    SchedulerModule,
    SandboxModule,
    TraceModule,
    BridgeModule,
  ],
})
export class AppModule {}
