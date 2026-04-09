import { Module } from '@nestjs/common';
import { TaskManagementService } from './services/task-management.service';
import { PlanModeService } from './services/plan-mode.service';
import { PlanPersistenceService } from './services/plan-persistence.service';
import { PlanExecutorService } from './services/plan-executor.service';
import { TaskToolsService } from './services/task-tools.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  providers: [
    TaskManagementService,
    PlanModeService,
    PlanPersistenceService,
    PlanExecutorService,
    TaskToolsService,
  ],
  exports: [
    TaskManagementService,
    PlanModeService,
    PlanExecutorService,
    TaskToolsService,
  ],
})
export class TasksModule {}
