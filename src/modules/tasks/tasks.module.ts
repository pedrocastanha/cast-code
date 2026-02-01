import { Module } from '@nestjs/common';
import { TaskManagementService } from './services/task-management.service';
import { PlanModeService } from './services/plan-mode.service';
import { TaskToolsService } from './services/task-tools.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  providers: [TaskManagementService, PlanModeService, TaskToolsService],
  exports: [TaskManagementService, PlanModeService, TaskToolsService],
})
export class TasksModule {}
