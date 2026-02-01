import { Module, forwardRef } from '@nestjs/common';
import { FilesystemToolsService } from './services/filesystem-tools.service';
import { ShellToolsService } from './services/shell-tools.service';
import { SearchToolsService } from './services/search-tools.service';
import { ToolsRegistryService } from './services/tools-registry.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [PermissionsModule, forwardRef(() => TasksModule)],
  providers: [
    FilesystemToolsService,
    ShellToolsService,
    SearchToolsService,
    ToolsRegistryService,
  ],
  exports: [ToolsRegistryService],
})
export class ToolsModule {}
