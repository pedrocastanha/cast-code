import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { KanbanServerService } from './services/kanban-server.service';

@Module({
  imports: [TasksModule],
  providers: [KanbanServerService],
  exports: [KanbanServerService],
})
export class KanbanModule {}
