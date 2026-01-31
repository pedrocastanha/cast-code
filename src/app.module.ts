import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { CoreModule } from './modules/core/core.module';
import { ReplModule } from './modules/repl/repl.module';

@Module({
  imports: [CommonModule, CoreModule, ReplModule],
})
export class AppModule {}
