import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PlatformModule } from '../platform/platform.module';
import { StateModule } from '../state/state.module';
import { BenchmarkCommandsService } from './commands/benchmark-commands.service';
import { BenchmarkArtifactService } from './services/benchmark-artifact.service';
import { BenchmarkCostService } from './services/benchmark-cost.service';
import { BenchmarkDefinitionService } from './services/benchmark-definition.service';
import { BenchmarkExplicitTargetService } from './services/benchmark-explicit-target.service';
import { BenchmarkGraderService } from './services/benchmark-grader.service';
import { BenchmarkHarnessPlannerService } from './services/benchmark-harness-planner.service';
import { BenchmarkModelLocatorService } from './services/benchmark-model-locator.service';
import { BenchmarkPlatformSyncService } from './services/benchmark-platform-sync.service';
import { BenchmarkRouteDiscoveryService } from './services/benchmark-route-discovery.service';
import { BenchmarkRunnerService } from './services/benchmark-runner.service';
import { BenchmarkSandboxDecisionService } from './services/benchmark-sandbox-decision.service';
import { BenchmarkStoreService } from './services/benchmark-store.service';
import { BenchmarkTargetService } from './services/benchmark-target.service';

@Module({
  imports: [CommonModule, StateModule, PlatformModule],
  providers: [
    BenchmarkCommandsService,
    BenchmarkArtifactService,
    BenchmarkCostService,
    BenchmarkDefinitionService,
    BenchmarkExplicitTargetService,
    BenchmarkGraderService,
    BenchmarkHarnessPlannerService,
    BenchmarkModelLocatorService,
    BenchmarkPlatformSyncService,
    BenchmarkRouteDiscoveryService,
    BenchmarkRunnerService,
    BenchmarkSandboxDecisionService,
    BenchmarkStoreService,
    BenchmarkTargetService,
  ],
  exports: [
    BenchmarkCommandsService,
    BenchmarkArtifactService,
    BenchmarkCostService,
    BenchmarkDefinitionService,
    BenchmarkExplicitTargetService,
    BenchmarkGraderService,
    BenchmarkHarnessPlannerService,
    BenchmarkModelLocatorService,
    BenchmarkPlatformSyncService,
    BenchmarkRouteDiscoveryService,
    BenchmarkRunnerService,
    BenchmarkSandboxDecisionService,
    BenchmarkStoreService,
    BenchmarkTargetService,
  ],
})
export class BenchmarkModule {}
