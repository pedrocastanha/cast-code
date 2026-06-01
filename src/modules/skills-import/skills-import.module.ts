import { Module } from '@nestjs/common';

import { SkillsModule } from '../skills/skills.module';
import { SkillsImportCommandsService } from './commands/skills-import-commands.service';
import { SkillPackageDiscoveryService } from './services/skill-package-discovery.service';
import { SkillConverterService } from './services/skill-converter.service';
import { SkillDuplicateDetectorService } from './services/skill-duplicate-detector.service';
import { SkillEnvironmentClassifierService } from './services/skill-environment-classifier.service';
import { SkillRiskScannerService } from './services/skill-risk-scanner.service';

@Module({
  imports: [SkillsModule],
  providers: [
    SkillPackageDiscoveryService,
    SkillRiskScannerService,
    SkillEnvironmentClassifierService,
    SkillConverterService,
    SkillDuplicateDetectorService,
    SkillsImportCommandsService,
  ],
  exports: [
    SkillPackageDiscoveryService,
    SkillRiskScannerService,
    SkillEnvironmentClassifierService,
    SkillConverterService,
    SkillDuplicateDetectorService,
    SkillsImportCommandsService,
  ],
})
export class SkillsImportModule {}
