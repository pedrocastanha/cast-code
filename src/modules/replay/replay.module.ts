import { Module } from '@nestjs/common';
import { ReplayService } from './services/replay.service';
import { TraceModule } from '../trace/trace.module';

@Module({
  imports: [TraceModule],
  providers: [ReplayService],
  exports: [ReplayService],
})
export class ReplayModule {}
