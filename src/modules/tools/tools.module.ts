import { Module, forwardRef } from '@nestjs/common';
import { FilesystemToolsService } from './services/filesystem-tools.service';
import { ShellToolsService } from './services/shell-tools.service';
import { SearchToolsService } from './services/search-tools.service';
import { DiscoveryToolsService } from './services/discovery-tools.service';
import { ToolsRegistryService } from './services/tools-registry.service';
import { ImpactAnalysisService } from './services/impact-analysis.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { TasksModule } from '../tasks/tasks.module';
import { MemoryModule } from '../memory/memory.module';
import { SkillsModule } from '../skills/skills.module';
import { AgentsModule } from '../agents/agents.module';
import { VaultModule } from '../vault/vault.module';

@Module({
  imports: [
    PermissionsModule,
    forwardRef(() => TasksModule),
    forwardRef(() => MemoryModule),
    forwardRef(() => SkillsModule),
    forwardRef(() => AgentsModule),
    VaultModule,
  ],
  providers: [
    FilesystemToolsService,
    ShellToolsService,
    SearchToolsService,
    DiscoveryToolsService,
    ToolsRegistryService,
    ImpactAnalysisService,
  ],
  exports: [ToolsRegistryService, DiscoveryToolsService, ImpactAnalysisService],
})
export class ToolsModule {}
