import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { RemoteModule } from '../remote/remote.module';
import { KanbanServerService } from './services/kanban-server.service';

@Module({
  imports: [TasksModule, RemoteModule],
  providers: [KanbanServerService],
  exports: [KanbanServerService],
})
export class KanbanModule {}
