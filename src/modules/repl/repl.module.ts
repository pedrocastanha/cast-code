import { Module } from '@nestjs/common';
import { ReplService } from './services/repl.service';
import { WelcomeScreenService } from './services/welcome-screen.service';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [ReplService, WelcomeScreenService],
  exports: [ReplService],
})
export class ReplModule {}
