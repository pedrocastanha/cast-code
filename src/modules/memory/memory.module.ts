import { Module } from '@nestjs/common';
import { MemoryService } from './services/memory.service';
import { MemoryToolsService } from './services/memory-tools.service';

@Module({
  providers: [MemoryService, MemoryToolsService],
  exports: [MemoryService, MemoryToolsService],
})
export class MemoryModule {}
