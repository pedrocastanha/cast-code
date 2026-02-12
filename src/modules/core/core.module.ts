import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '../../common/services/config.service';
import { DeepAgentService } from './services/deep-agent.service';
import { PlanModeService } from './services/plan-mode.service';
import { AgentsModule } from '../agents/agents.module';
import { SkillsModule } from '../skills/skills.module';
import { ToolsModule } from '../tools/tools.module';
import { McpModule } from '../mcp/mcp.module';
import { ProjectModule } from '../project/project.module';
import { MemoryModule } from '../memory/memory.module';
import { MentionsModule } from '../mentions/mentions.module';

@Module({
  imports: [AgentsModule, SkillsModule, forwardRef(() => ToolsModule), McpModule, ProjectModule, forwardRef(() => MemoryModule), MentionsModule],
  providers: [ConfigService, DeepAgentService, PlanModeService],
  exports: [ConfigService, DeepAgentService, PlanModeService, MentionsModule, McpModule, AgentsModule, SkillsModule],
})
export class CoreModule {}
