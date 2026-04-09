import { Module } from '@nestjs/common';
import { FilesystemToolsService } from './services/filesystem-tools.service';
import { ShellToolsService } from './services/shell-tools.service';
import { SearchToolsService } from './services/search-tools.service';
import { DiscoveryToolsService } from './services/discovery-tools.service';
import { ToolsRegistryService } from './services/tools-registry.service';
import { ImpactAnalysisService } from './services/impact-analysis.service';
import { CapabilitiesModule } from '../capabilities';
import { PermissionsModule } from '../permissions/permissions.module';
import { AgentsModule } from '../agents/agents.module';
import { SkillsModule } from '../skills/skills.module';
import { VaultModule } from '../vault/vault.module';
import { TasksModule } from '../tasks/tasks.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [
    CapabilitiesModule,
    PermissionsModule,
    AgentsModule,
    SkillsModule,
    VaultModule,
    TasksModule,
    MemoryModule,
  ],
  providers: [
    FilesystemToolsService,
    ShellToolsService,
    SearchToolsService,
    DiscoveryToolsService,
    ToolsRegistryService,
    ImpactAnalysisService,
  ],
  exports: [ToolsRegistryService, DiscoveryToolsService, ImpactAnalysisService, FilesystemToolsService],
})
export class ToolsModule {}
