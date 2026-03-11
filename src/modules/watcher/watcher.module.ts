import { Module } from '@nestjs/common';
import { FileWatcherService } from './services/file-watcher.service';

@Module({
  providers: [FileWatcherService],
  exports: [FileWatcherService],
})
export class WatcherModule {}
