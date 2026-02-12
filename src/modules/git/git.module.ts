import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { CommitGeneratorService } from './services/commit-generator.service';
import { MonorepoDetectorService } from './services/monorepo-detector.service';
import { PrGeneratorService } from './services/pr-generator.service';
import { CodeReviewService } from './services/code-review.service';
import { ReleaseNotesService } from './services/release-notes.service';

@Module({
  imports: [CommonModule],
  providers: [
    CommitGeneratorService, 
    MonorepoDetectorService, 
    PrGeneratorService,
    CodeReviewService,
    ReleaseNotesService,
  ],
  exports: [
    CommitGeneratorService, 
    MonorepoDetectorService, 
    PrGeneratorService,
    CodeReviewService,
    ReleaseNotesService,
  ],
})
export class GitModule {}
