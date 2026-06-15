import { Module, forwardRef } from '@nestjs/common';
import { AgentLoaderService } from './services/agent-loader.service';
import { AgentRegistryService } from './services/agent-registry.service';
import { AgentRunService } from './services/agent-run.service';
import { SkillsModule } from '../skills/skills.module';
import { ToolsModule } from '../tools/tools.module';
import { McpModule } from '../mcp/mcp.module';
import { TraceModule } from '../trace/trace.module';

@Module({
  imports: [SkillsModule, forwardRef(() => ToolsModule), McpModule, TraceModule],
  providers: [AgentLoaderService, AgentRegistryService, AgentRunService],
  exports: [AgentLoaderService, AgentRegistryService, AgentRunService],
})
export class AgentsModule {}
