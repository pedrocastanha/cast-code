import { Module } from '@nestjs/common';
import { AgentLoaderService } from './services/agent-loader.service';
import { AgentRegistryService } from './services/agent-registry.service';
import { SkillsModule } from '../skills/skills.module';
import { CapabilitiesModule } from '../capabilities';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [SkillsModule, CapabilitiesModule, McpModule],
  providers: [AgentLoaderService, AgentRegistryService],
  exports: [AgentLoaderService, AgentRegistryService],
})
export class AgentsModule {}
