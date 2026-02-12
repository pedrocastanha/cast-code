import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { CommitGeneratorService } from './services/commit-generator.service';
import { MonorepoDetectorService } from './services/monorepo-detector.service';

@Module({
  imports: [CommonModule],
  providers: [CommitGeneratorService, MonorepoDetectorService],
  exports: [CommitGeneratorService, MonorepoDetectorService],
})
export class GitModule {}
