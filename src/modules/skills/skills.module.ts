import { Module } from '@nestjs/common';
import { SkillLoaderService } from './services/skill-loader.service';
import { SkillRegistryService } from './services/skill-registry.service';
import { SkillActivationService } from './services/skill-activation.service';
import { CapabilitiesModule } from '../capabilities';

@Module({
  imports: [CapabilitiesModule],
  providers: [SkillLoaderService, SkillRegistryService, SkillActivationService],
  exports: [SkillLoaderService, SkillRegistryService, SkillActivationService],
})
export class SkillsModule {}
