import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { RemoteModule } from '../remote/remote.module';
import { KanbanServerService } from './services/kanban-server.service';
import { KanbanController } from './controllers/kanban.controller';

@Module({
  imports: [TasksModule, RemoteModule],
  controllers: [KanbanController],
  providers: [KanbanServerService],
  exports: [KanbanServerService],
})
export class KanbanModule {}
