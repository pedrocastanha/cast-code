import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { CoreModule } from './modules/core/core.module';
import { ReplModule } from './modules/repl/repl.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { TasksModule } from './modules/tasks/tasks.module';

@Module({
  imports: [CommonModule, CoreModule, ReplModule, PermissionsModule, TasksModule],
})
export class AppModule {}
