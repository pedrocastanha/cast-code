import { Module } from '@nestjs/common';
import { FilesystemToolsService } from './services/filesystem-tools.service';
import { ShellToolsService } from './services/shell-tools.service';
import { SearchToolsService } from './services/search-tools.service';
import { ToolsRegistryService } from './services/tools-registry.service';

@Module({
  providers: [
    FilesystemToolsService,
    ShellToolsService,
    SearchToolsService,
    ToolsRegistryService,
  ],
  exports: [ToolsRegistryService],
})
export class ToolsModule {}
