import { Module, forwardRef } from '@nestjs/common';
import { AgentLoaderService } from './services/agent-loader.service';
import { AgentRegistryService } from './services/agent-registry.service';
import { AgentDefinitionValidatorService } from './services/agent-definition-validator.service';
import { AgentRunService } from './services/agent-run.service';
import { SkillsModule } from '../skills/skills.module';
import { ToolsModule } from '../tools/tools.module';
import { McpModule } from '../mcp/mcp.module';
import { TraceModule } from '../trace/trace.module';

@Module({
  imports: [SkillsModule, forwardRef(() => ToolsModule), McpModule, TraceModule],
  providers: [AgentLoaderService, AgentRegistryService, AgentDefinitionValidatorService, AgentRunService],
  exports: [AgentLoaderService, AgentRegistryService, AgentDefinitionValidatorService, AgentRunService],
})
export class AgentsModule {}
