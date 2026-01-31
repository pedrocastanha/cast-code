import { Module } from '@nestjs/common';
import { McpClientService } from './services/mcp-client.service';
import { McpRegistryService } from './services/mcp-registry.service';

@Module({
  providers: [McpClientService, McpRegistryService],
  exports: [McpRegistryService],
})
export class McpModule {}
