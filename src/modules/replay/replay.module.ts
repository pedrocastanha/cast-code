import { Module } from '@nestjs/common';
import { ReplayService } from './services/replay.service';

@Module({
  providers: [ReplayService],
  exports: [ReplayService],
})
export class ReplayModule {}
