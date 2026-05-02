import { Module, forwardRef } from '@nestjs/common';
import { MemoryService } from './services/memory.service';
import { MemoryToolsService } from './services/memory-tools.service';
import { PlatformModule } from '../platform/platform.module';

@Module({
  imports: [forwardRef(() => PlatformModule)],
  providers: [MemoryService, MemoryToolsService],
  exports: [MemoryService, MemoryToolsService],
})
export class MemoryModule {}
