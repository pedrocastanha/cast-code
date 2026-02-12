import { Module } from '@nestjs/common';
import { ReplService } from './services/repl.service';
import { WelcomeScreenService } from './services/welcome-screen.service';
import { CoreModule } from '../core/core.module';
import { GitModule } from '../git/git.module';

@Module({
  imports: [CoreModule, GitModule],
  providers: [ReplService, WelcomeScreenService],
  exports: [ReplService],
})
export class ReplModule {}
