import { Injectable, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SkillLoaderService } from './skill-loader.service';
import { SkillScopeResolverService } from './skill-scope-resolver.service';
import { SkillVersionService } from './skill-version.service';
import { SkillValidationService } from './skill-validation.service';
import { SkillReloadResult } from '../types/skill-runtime.types';
import { TraceContextService } from '../../trace/services/trace-context.service';
import { TraceWriterService } from '../../trace/services/trace-writer.service';

@Injectable()
export class SkillReloadService {
  constructor(
    private readonly skillLoader: SkillLoaderService,
    private readonly scopeResolver: SkillScopeResolverService,
    private readonly versionService: SkillVersionService,
    private readonly validationService: SkillValidationService,
    @Optional() private readonly traceContext?: TraceContextService,
    @Optional() private readonly traceWriter?: TraceWriterService,
  ) {}

  async reloadSkill(name: string, options: { projectRoot?: string } = {}): Promise<SkillReloadResult> {
    await this.reloadProjectPath(options.projectRoot || process.cwd());
    const skill = this.skillLoader.getUnscopedSkill(name);
    if (!skill) {
      const result = { ok: false, message: `Skill "${name}" not found.`, records: [], warnings: [], errors: [`Skill "${name}" not found.`] };
      this.trace('skill.invalid', { name, errors: result.errors });
      return result;
    }

    const validation = this.validationService.validate(skill);
    if (!validation.ok) {
      const errors = validation.errors.map((issue) => issue.message);
      this.trace('skill.invalid', { name: skill.name, errors });
      return { ok: false, message: `Skill "${skill.name}" is invalid.`, records: [], warnings: validation.warnings.map((issue) => issue.message), errors };
    }

    const record = this.scopeResolver.resolveSkill(skill.name, this.skillLoader.getAllUnscopedSkills(), {
      projectRoot: options.projectRoot || process.cwd(),
    });
    const records = record ? [record] : [];
    this.trace('skill.reloaded', {
      name: skill.name,
      version: this.versionService.hashSkill(skill),
      scope: record?.scope,
    });
    return {
      ok: true,
      message: `Reloaded ${skill.name}`,
      records,
      warnings: validation.warnings.map((issue) => issue.message),
      errors: [],
    };
  }

  async reloadAll(options: { projectRoot?: string } = {}): Promise<SkillReloadResult> {
    await this.reloadProjectPath(options.projectRoot || process.cwd());
    const skills = this.skillLoader.getAllUnscopedSkills();
    const resolution = this.scopeResolver.resolveAll(skills, { projectRoot: options.projectRoot || process.cwd() });
    this.trace('skill.reloaded', { count: resolution.records.length });
    return {
      ok: true,
      message: `Reloaded ${resolution.records.length} skills`,
      records: resolution.records.filter((record) => record.status === 'active'),
      warnings: [],
      errors: [],
    };
  }

  private async reloadProjectPath(projectRoot: string): Promise<void> {
    const projectSkillsPath = path.join(projectRoot, '.cast', 'skills');
    if (fs.existsSync(projectSkillsPath)) {
      await this.skillLoader.loadFromPath(projectSkillsPath);
    }
  }

  private trace(type: 'skill.reloaded' | 'skill.invalid', payload: Record<string, unknown>): void {
    if (!this.traceContext || !this.traceWriter) return;
    const context = this.traceContext.getCurrent();
    this.traceWriter.append({
      eventId: this.traceContext.nextEventId(),
      sessionId: context.sessionId,
      runId: context.rootRunId,
      type,
      payload,
    });
  }
}
