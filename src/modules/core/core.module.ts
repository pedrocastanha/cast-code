import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { DeepAgentService } from './services/deep-agent.service';
import { AgentsModule } from '../agents/agents.module';
import { SkillsModule } from '../skills/skills.module';
import { ToolsModule } from '../tools/tools.module';
import { McpModule } from '../mcp/mcp.module';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [AgentsModule, SkillsModule, ToolsModule, McpModule, ProjectModule],
  providers: [ConfigService, DeepAgentService],
  exports: [ConfigService, DeepAgentService],
})
export class CoreModule {}
