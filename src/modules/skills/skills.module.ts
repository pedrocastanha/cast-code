import { Module } from '@nestjs/common';
import { SkillLoaderService } from './services/skill-loader.service';
import { SkillRegistryService } from './services/skill-registry.service';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [ToolsModule],
  providers: [SkillLoaderService, SkillRegistryService],
  exports: [SkillRegistryService],
})
export class SkillsModule {}
