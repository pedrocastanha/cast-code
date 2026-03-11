import { Module } from '@nestjs/common';
import { DiffService } from './services/diff.service';

@Module({
  providers: [DiffService],
  exports: [DiffService],
})
export class DiffModule {}
