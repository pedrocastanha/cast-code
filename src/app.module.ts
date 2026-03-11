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
  ],
})
export class AppModule {}
