import { Module, forwardRef } from '@nestjs/common';
import { SkillLoaderService } from './services/skill-loader.service';
import { SkillRegistryService } from './services/skill-registry.service';
import { SkillAssetService } from './services/skill-asset.service';
import { SkillRuntimeToolsService } from './services/skill-runtime-tools.service';
import { SkillMetadataIndexService } from './services/skill-metadata-index.service';
import { SkillSearchService } from './services/skill-search.service';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [forwardRef(() => ToolsModule)],
  providers: [
    SkillLoaderService,
    SkillRegistryService,
    SkillAssetService,
    SkillRuntimeToolsService,
    SkillMetadataIndexService,
    SkillSearchService,
  ],
  exports: [
    SkillLoaderService,
    SkillRegistryService,
    SkillAssetService,
    SkillRuntimeToolsService,
    SkillMetadataIndexService,
    SkillSearchService,
  ],
})
export class SkillsModule {}
