import { Module } from '@nestjs/common';
import { BenchmarkModule } from '../benchmark/benchmark.module';
import { EnvironmentModule } from '../environments/environment.module';
import { PlatformModule } from '../platform/platform.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { StateModule } from '../state/state.module';
import { ScheduleCommandsService } from './commands/schedule-commands.service';
import { ScheduleCronService } from './services/schedule-cron.service';
import { SchedulePlatformSyncService } from './services/schedule-platform-sync.service';
import { SchedulePolicyService } from './services/schedule-policy.service';
import { ScheduleRunnerService } from './services/schedule-runner.service';
import { ScheduleStoreService } from './services/schedule-store.service';
import { ScheduleSuggestionService } from './services/schedule-suggestion.service';
import { ScheduleWorkerService } from './services/schedule-worker.service';

@Module({
  imports: [
    StateModule,
    BenchmarkModule,
    PlatformModule,
    EnvironmentModule,
    SandboxModule,
  ],
  providers: [
    ScheduleCommandsService,
    ScheduleCronService,
    SchedulePlatformSyncService,
    SchedulePolicyService,
    ScheduleRunnerService,
    ScheduleStoreService,
    ScheduleSuggestionService,
    ScheduleWorkerService,
  ],
  exports: [
    ScheduleCommandsService,
    ScheduleCronService,
    SchedulePlatformSyncService,
    SchedulePolicyService,
    ScheduleRunnerService,
    ScheduleStoreService,
    ScheduleSuggestionService,
    ScheduleWorkerService,
  ],
})
export class SchedulerModule {}
