import { Module, OnModuleInit } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DeepAgentService } from './services/deep-agent.service';
import { PlanModeService } from './services/plan-mode.service';
import { PromptLoaderService } from './services/prompt-loader.service';
import { PromptClassifierService } from './services/prompt-classifier.service';
import { AgentsModule } from '../agents/agents.module';
import { SkillsModule } from '../skills/skills.module';
import { ToolsModule } from '../tools/tools.module';
import { McpModule } from '../mcp/mcp.module';
import { ProjectModule } from '../project/project.module';
import { MemoryModule } from '../memory/memory.module';
import { MentionsModule } from '../mentions/mentions.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SnapshotModule } from '../snapshots/snapshot.module';
import { StatsModule } from '../stats/stats.module';
import { ReplayModule } from '../replay/replay.module';
import { WatcherModule } from '../watcher/watcher.module';
import { ToolOutputProxyModule } from '../../shared/tool-output-proxy';
import { PromptBuilderService, CriticalRulesSection, ToolsSection, AgentIdentitySection, TaskKanbanSection, PlanningSection, McpProtocolSection, SubAgentsSection, ExecutionProtocolSection, DecisionMakingSection, GitSafetySection, EnvironmentSection } from './services/prompt-builders';

@Module({
  imports: [
    CommonModule,
    AgentsModule,
    SkillsModule,
    ToolsModule,
    McpModule,
    ProjectModule,
    MemoryModule,
    MentionsModule,
    PermissionsModule,
    SnapshotModule,
    StatsModule,
    ReplayModule,
    WatcherModule,
    ToolOutputProxyModule,
  ],
  providers: [
    DeepAgentService,
    PlanModeService,
    PromptLoaderService,
    PromptClassifierService,
    PromptBuilderService,
    AgentIdentitySection,
    CriticalRulesSection,
    ToolsSection,
    TaskKanbanSection,
    McpProtocolSection,
    PlanningSection,
    SubAgentsSection,
    ExecutionProtocolSection,
    DecisionMakingSection,
    GitSafetySection,
    EnvironmentSection,
  ],
  exports: [DeepAgentService, PlanModeService, PromptLoaderService, PromptClassifierService, MentionsModule, McpModule, AgentsModule, SkillsModule, PromptBuilderService],
})
export class CoreModule implements OnModuleInit {
  constructor(
    private readonly promptBuilder: PromptBuilderService,
    private readonly agentIdentity: AgentIdentitySection,
    private readonly criticalRules: CriticalRulesSection,
    private readonly toolsSection: ToolsSection,
    private readonly taskKanban: TaskKanbanSection,
    private readonly mcpProtocol: McpProtocolSection,
    private readonly planning: PlanningSection,
    private readonly subAgents: SubAgentsSection,
    private readonly executionProtocol: ExecutionProtocolSection,
    private readonly decisionMaking: DecisionMakingSection,
    private readonly gitSafety: GitSafetySection,
    private readonly environment: EnvironmentSection,
  ) {}

  onModuleInit() {
    this.promptBuilder.register(this.agentIdentity);
    this.promptBuilder.register(this.criticalRules);
    this.promptBuilder.register(this.toolsSection);
    this.promptBuilder.register(this.taskKanban);
    this.promptBuilder.register(this.mcpProtocol);
    this.promptBuilder.register(this.planning);
    this.promptBuilder.register(this.subAgents);
    this.promptBuilder.register(this.executionProtocol);
    this.promptBuilder.register(this.decisionMaking);
    this.promptBuilder.register(this.gitSafety);
    this.promptBuilder.register(this.environment);
  }
}
