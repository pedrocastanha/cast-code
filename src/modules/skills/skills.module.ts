import { Module, forwardRef } from '@nestjs/common';
import { SkillLoaderService } from './services/skill-loader.service';
import { SkillRegistryService } from './services/skill-registry.service';
import { SkillAssetService } from './services/skill-asset.service';
import { SkillRuntimeToolsService } from './services/skill-runtime-tools.service';
import { SkillMetadataIndexService } from './services/skill-metadata-index.service';
import { SkillSearchService } from './services/skill-search.service';
import { SkillReloadService } from './services/skill-reload.service';
import { SkillScopeResolverService } from './services/skill-scope-resolver.service';
import { SkillValidationService } from './services/skill-validation.service';
import { SkillVersionService } from './services/skill-version.service';
import { ToolsModule } from '../tools/tools.module';
import { TraceModule } from '../trace/trace.module';

@Module({
  imports: [forwardRef(() => ToolsModule), TraceModule],
  providers: [
    SkillLoaderService,
    SkillRegistryService,
    SkillAssetService,
    SkillRuntimeToolsService,
    SkillMetadataIndexService,
    SkillSearchService,
    SkillVersionService,
    SkillScopeResolverService,
    SkillValidationService,
    SkillReloadService,
  ],
  exports: [
    SkillLoaderService,
    SkillRegistryService,
    SkillAssetService,
    SkillRuntimeToolsService,
    SkillMetadataIndexService,
    SkillSearchService,
    SkillVersionService,
    SkillScopeResolverService,
    SkillValidationService,
    SkillReloadService,
  ],
})
export class SkillsModule {}
