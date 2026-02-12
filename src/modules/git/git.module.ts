import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { CommitGeneratorService } from './services/commit-generator.service';
import { MonorepoDetectorService } from './services/monorepo-detector.service';
import { PrGeneratorService } from './services/pr-generator.service';

@Module({
  imports: [CommonModule],
  providers: [CommitGeneratorService, MonorepoDetectorService, PrGeneratorService],
  exports: [CommitGeneratorService, MonorepoDetectorService, PrGeneratorService],
})
export class GitModule {}
