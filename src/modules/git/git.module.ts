import { Module } from '@nestjs/common';
import { CommitGeneratorService } from './services/commit-generator.service';
import { MonorepoDetectorService } from './services/monorepo-detector.service';

@Module({
  providers: [
    CommitGeneratorService,
    MonorepoDetectorService,
  ],
  exports: [
    CommitGeneratorService,
    MonorepoDetectorService,
  ],
})
export class GitModule {}
