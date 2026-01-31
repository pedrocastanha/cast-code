import { Module } from '@nestjs/common';
import { ReplService } from './services/repl.service';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [ReplService],
  exports: [ReplService],
})
export class ReplModule {}
