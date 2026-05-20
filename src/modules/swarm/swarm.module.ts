import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { BridgeModule } from '../bridge/bridge.module';
import { ProjectModule } from '../project/project.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { SkillsModule } from '../skills/skills.module';
import { StateModule } from '../state/state.module';
import { ToolsModule } from '../tools/tools.module';
import { TraceModule } from '../trace/trace.module';
import { SwarmCommandsService } from './commands/swarm-commands.service';
import { SwarmBridgeRuntimeService } from './services/swarm-bridge-runtime.service';
import { SwarmDispatcherService } from './services/swarm-dispatcher.service';
import { SwarmIntegrationService } from './services/swarm-integration.service';
import { SwarmIsolatedAgentService } from './services/swarm-isolated-agent.service';
import { SwarmOwnershipService } from './services/swarm-ownership.service';
import { SwarmPlanApprovalService } from './services/swarm-plan-approval.service';
import { SwarmPlannerService } from './services/swarm-planner.service';
import { SwarmRunStoreService } from './services/swarm-run-store.service';
import { SwarmSuggestionService } from './services/swarm-suggestion.service';
import { SwarmValidationService } from './services/swarm-validation.service';
import { SwarmWorkerRuntimeService } from './services/swarm-worker-runtime.service';
import { SwarmWorktreeService } from './services/swarm-worktree.service';

@Module({
  imports: [
    StateModule,
    AgentsModule,
    SkillsModule,
    ProjectModule,
    TraceModule,
    SandboxModule,
    ToolsModule,
    forwardRef(() => BridgeModule),
  ],
  providers: [
    SwarmCommandsService,
    SwarmRunStoreService,
    SwarmPlannerService,
    SwarmPlanApprovalService,
    SwarmSuggestionService,
    SwarmValidationService,
    SwarmBridgeRuntimeService,
    SwarmWorktreeService,
    SwarmOwnershipService,
    SwarmIsolatedAgentService,
    SwarmWorkerRuntimeService,
    SwarmDispatcherService,
    SwarmIntegrationService,
  ],
  exports: [
    SwarmCommandsService,
    SwarmRunStoreService,
    SwarmPlannerService,
    SwarmPlanApprovalService,
    SwarmSuggestionService,
    SwarmValidationService,
    SwarmBridgeRuntimeService,
    SwarmDispatcherService,
    SwarmIntegrationService,
    SwarmWorkerRuntimeService,
    SwarmWorktreeService,
  ],
})
export class SwarmModule implements OnModuleInit {
  constructor(
    private readonly workerRuntime: SwarmWorkerRuntimeService,
    private readonly isolatedAgent: SwarmIsolatedAgentService,
  ) {}

  onModuleInit(): void {
    this.workerRuntime.setIsolatedAgent(this.isolatedAgent);
  }
}
