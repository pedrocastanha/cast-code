import { Module } from '@nestjs/common';
import { ProjectLoaderService } from './services/project-loader.service';
import { ProjectContextService } from './services/project-context.service';
import { ProjectAnalyzerService } from './services/project-analyzer.service';

@Module({
  providers: [ProjectLoaderService, ProjectContextService, ProjectAnalyzerService],
  exports: [ProjectLoaderService, ProjectContextService, ProjectAnalyzerService],
})
export class ProjectModule {}
