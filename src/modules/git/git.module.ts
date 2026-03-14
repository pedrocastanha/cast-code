import { Module, forwardRef } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { CoreModule } from '../core/core.module';
import { CommitGeneratorService } from './services/commit-generator.service';
import { MonorepoDetectorService } from './services/monorepo-detector.service';
import { PrGeneratorService } from './services/pr-generator.service';
import { CodeReviewService } from './services/code-review.service';
import { ReleaseNotesService } from './services/release-notes.service';
import { UnitTestGeneratorService } from './services/unit-test-generator.service';

@Module({
  imports: [CommonModule, forwardRef(() => CoreModule)],
  providers: [
    CommitGeneratorService, 
    MonorepoDetectorService, 
    PrGeneratorService,
    CodeReviewService,
    ReleaseNotesService,
    UnitTestGeneratorService,
  ],
  exports: [
    CommitGeneratorService, 
    MonorepoDetectorService, 
    PrGeneratorService,
    CodeReviewService,
    ReleaseNotesService,
    UnitTestGeneratorService,
  ],
})
export class GitModule {}
