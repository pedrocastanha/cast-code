import { Module, forwardRef } from '@nestjs/common';
import { FilesystemToolsService } from './services/filesystem-tools.service';
import { ShellToolsService } from './services/shell-tools.service';
import { SearchToolsService } from './services/search-tools.service';
import { DiscoveryToolsService } from './services/discovery-tools.service';
import { ToolsRegistryService } from './services/tools-registry.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { TasksModule } from '../tasks/tasks.module';
import { MemoryModule } from '../memory/memory.module';
import { SkillsModule } from '../skills/skills.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    PermissionsModule,
    forwardRef(() => TasksModule),
    forwardRef(() => MemoryModule),
    forwardRef(() => SkillsModule),
    forwardRef(() => AgentsModule),
  ],
  providers: [
    FilesystemToolsService,
    ShellToolsService,
    SearchToolsService,
    DiscoveryToolsService,
    ToolsRegistryService,
  ],
  exports: [ToolsRegistryService, DiscoveryToolsService],
})
export class ToolsModule {}
