import { Module, forwardRef } from '@nestjs/common';
import { SkillLoaderService } from './services/skill-loader.service';
import { SkillRegistryService } from './services/skill-registry.service';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [forwardRef(() => ToolsModule)],
  providers: [SkillLoaderService, SkillRegistryService],
  exports: [SkillLoaderService, SkillRegistryService],
})
export class SkillsModule {}
