import { Module, forwardRef } from '@nestjs/common';
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

@Module({
  imports: [
    CommonModule,
    AgentsModule,
    SkillsModule,
    forwardRef(() => ToolsModule),
    McpModule,
    ProjectModule,
    forwardRef(() => MemoryModule),
    MentionsModule,
    PermissionsModule,
    SnapshotModule,
    StatsModule,
    ReplayModule,
    WatcherModule,
  ],
  providers: [DeepAgentService, PlanModeService, PromptLoaderService, PromptClassifierService],
  exports: [DeepAgentService, PlanModeService, PromptLoaderService, PromptClassifierService, MentionsModule, McpModule, AgentsModule, SkillsModule],
})
export class CoreModule {}
