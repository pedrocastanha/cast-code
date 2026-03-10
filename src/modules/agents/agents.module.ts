import { Module, forwardRef } from '@nestjs/common';
import { AgentLoaderService } from './services/agent-loader.service';
import { AgentRegistryService } from './services/agent-registry.service';
import { SkillsModule } from '../skills/skills.module';
import { ToolsModule } from '../tools/tools.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [SkillsModule, forwardRef(() => ToolsModule), McpModule],
  providers: [AgentLoaderService, AgentRegistryService],
  exports: [AgentLoaderService, AgentRegistryService],
})
export class AgentsModule {}
