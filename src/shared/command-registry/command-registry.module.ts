import { Global, Module } from '@nestjs/common';
import { CommandRegistryService } from './command-registry.service';

@Global()
@Module({
  providers: [CommandRegistryService],
  exports: [CommandRegistryService],
})
export class CommandRegistryModule {}
