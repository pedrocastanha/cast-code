import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { SkillRisk } from '../../skills/types';
import { SkillPackageDiscoveryService } from '../services/skill-package-discovery.service';
import { SkillConverterService } from '../services/skill-converter.service';
import { SkillDuplicateDetectorService } from '../services/skill-duplicate-detector.service';
import { SkillEnvironmentClassifierService } from '../services/skill-environment-classifier.service';
import { SkillRiskScannerService } from '../services/skill-risk-scanner.service';
import { SkillImportReportItem, SkillsImportReport } from '../types/skills-import.types';

export interface SkillsImportCommandResult {
  ok: boolean;
  message: string;
  report?: SkillsImportReport;
}

const RISK_ORDER: SkillRisk[] = ['low', 'medium', 'high', 'critical'];

@Injectable()
export class SkillsImportCommandsService {
  constructor(
    private readonly discovery: SkillPackageDiscoveryService,
    private readonly scanner: SkillRiskScannerService,
    private readonly classifier: SkillEnvironmentClassifierService,
    private readonly converter: SkillConverterService,
    private readonly duplicateDetector: SkillDuplicateDetectorService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async handle(args: string[]): Promise<SkillsImportCommandResult> {
    const [subcommand, repoPath, ...flags] = args;
    if (subcommand !== 'import' || !repoPath) {
      return {
        ok: false,
        message: 'Usage: /skills import {path} --dry-run | --approve {skillName}',
      };
    }

    const report = await this.buildReport(repoPath);
    const approveIndex = flags.indexOf('--approve');

    if (flags.includes('--dry-run')) {
      return {
        ok: true,
        message: this.formatReport(report),
        report,
      };
    }

    if (approveIndex >= 0) {
      const skillName = flags[approveIndex + 1];
      if (!skillName) {
        return { ok: false, message: 'Missing skill name after --approve.', report };
      }
      return this.approveSkill(report, skillName);
    }

    return {
      ok: false,
      message: 'Choose --dry-run or --approve {skillName}.',
      report,
    };
  }

  private async buildReport(repoPath: string): Promise<SkillsImportReport> {
    const skills = await this.discovery.discover(repoPath);
    const existingSkills = this.skillRegistry.getAllUnscopedSkills();
    const items: SkillImportReportItem[] = skills.map((skill) => {
      const scan = this.scanner.scan(skill);
      const environments = this.classifier.classify(skill);
      return {
        skill,
        risk: scan.risk,
        findings: scan.findings,
        environments,
        tags: this.deriveTags(skill, environments),
        duplicate: this.duplicateDetector.detect(skill, existingSkills),
      };
    });

    return {
      discovered: items.length,
      countsByRisk: this.countByRisk(items),
      items,
    };
  }

  private async approveSkill(report: SkillsImportReport, skillName: string): Promise<SkillsImportCommandResult> {
    const item = report.items.find((candidate) => candidate.skill.name === skillName);
    if (!item) {
      return { ok: false, message: `Skill "${skillName}" was not found in the import report.`, report };
    }

    if (item.risk === 'critical') {
      return {
        ok: false,
        message: `Skill "${skillName}" has critical scanner findings and cannot be imported until remediated.`,
        report,
      };
    }

    const destinationDir = path.join(process.cwd(), '.cast', 'skills');
    await fs.mkdir(destinationDir, { recursive: true });
    const destinationPath = path.join(destinationDir, `${this.slugify(item.skill.name)}.md`);
    const markdown = this.converter.convertToMarkdown({
      skill: item.skill,
      scan: { risk: item.risk, findings: item.findings },
      environments: item.environments,
      tags: item.tags,
    });
    await fs.writeFile(destinationPath, markdown, 'utf-8');

    return {
      ok: true,
      message: `Imported "${item.skill.name}" to ${destinationPath} with isActive=false.`,
      report,
    };
  }

  private formatReport(report: SkillsImportReport): string {
    const counts = RISK_ORDER.map((risk) => `${risk}=${report.countsByRisk[risk]}`).join(' ');
    const lines = [
      `Skill import dry-run: discovered=${report.discovered} ${counts}`,
      'Skills:',
      ...report.items.map((item) => {
        const duplicate = item.duplicate.status === 'none' ? 'none' : item.duplicate.status;
        return [
          `- ${item.skill.name}`,
          `env=${item.environments.join(',')}`,
          `risk=${item.risk}`,
          `findings=${item.findings.length}`,
          `duplicate=${duplicate}`,
        ].join(' ');
      }),
    ];

    return lines.join('\n');
  }

  private countByRisk(items: SkillImportReportItem[]): Record<SkillRisk, number> {
    return items.reduce<Record<SkillRisk, number>>(
      (counts, item) => {
        counts[item.risk] += 1;
        return counts;
      },
      { low: 0, medium: 0, high: 0, critical: 0 },
    );
  }

  private deriveTags(skill: { name: string; description: string }, environments: string[]): string[] {
    const words = `${skill.name} ${skill.description}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !['skill', 'with', 'from', 'this'].includes(word));
    return [...new Set([...environments, ...words])].slice(0, 8);
  }

  private slugify(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';
  }
}
