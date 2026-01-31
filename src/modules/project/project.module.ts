import { Module } from '@nestjs/common';
import { ProjectLoaderService } from './services/project-loader.service';
import { ProjectContextService } from './services/project-context.service';

@Module({
  providers: [ProjectLoaderService, ProjectContextService],
  exports: [ProjectLoaderService, ProjectContextService],
})
export class ProjectModule {}
