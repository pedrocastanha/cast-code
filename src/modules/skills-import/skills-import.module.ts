import { Module } from '@nestjs/common';

import { SkillsModule } from '../skills/skills.module';
import { SkillsImportCommandsService } from './commands/skills-import-commands.service';
import { HermesSkillDiscoveryService } from './services/hermes-skill-discovery.service';
import { SkillConverterService } from './services/skill-converter.service';
import { SkillDuplicateDetectorService } from './services/skill-duplicate-detector.service';
import { SkillEnvironmentClassifierService } from './services/skill-environment-classifier.service';
import { SkillRiskScannerService } from './services/skill-risk-scanner.service';

@Module({
  imports: [SkillsModule],
  providers: [
    HermesSkillDiscoveryService,
    SkillRiskScannerService,
    SkillEnvironmentClassifierService,
    SkillConverterService,
    SkillDuplicateDetectorService,
    SkillsImportCommandsService,
  ],
  exports: [
    HermesSkillDiscoveryService,
    SkillRiskScannerService,
    SkillEnvironmentClassifierService,
    SkillConverterService,
    SkillDuplicateDetectorService,
    SkillsImportCommandsService,
  ],
})
export class SkillsImportModule {}
