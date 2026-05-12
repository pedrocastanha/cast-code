import { Module } from '@nestjs/common';
import { BenchmarkModule } from '../benchmark/benchmark.module';
import { McpModule } from '../mcp/mcp.module';
import { PlatformModule } from '../platform/platform.module';
import { ProjectModule } from '../project/project.module';
import { SkillsModule } from '../skills/skills.module';
import { StateModule } from '../state/state.module';
import { EnvironmentCommandsService } from './commands/environment-commands.service';
import { EnvironmentActivationService } from './services/environment-activation.service';
import { EnvironmentLoaderService } from './services/environment-loader.service';
import { EnvironmentReadinessService } from './services/environment-readiness.service';
import { EnvironmentResolverService } from './services/environment-resolver.service';

@Module({
  imports: [
    StateModule,
    PlatformModule,
    ProjectModule,
    BenchmarkModule,
    SkillsModule,
    McpModule,
  ],
  providers: [
    EnvironmentCommandsService,
    EnvironmentActivationService,
    EnvironmentLoaderService,
    EnvironmentReadinessService,
    EnvironmentResolverService,
  ],
  exports: [
    EnvironmentCommandsService,
    EnvironmentActivationService,
    EnvironmentLoaderService,
    EnvironmentReadinessService,
    EnvironmentResolverService,
  ],
})
export class EnvironmentModule {}
