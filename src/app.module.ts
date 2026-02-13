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

@Module({
  imports: [ConfigModule, CommonModule, CoreModule, ReplModule, PermissionsModule, TasksModule, MemoryModule, MentionsModule, GitModule],
})
export class AppModule {}
