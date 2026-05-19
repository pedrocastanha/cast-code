import { Injectable } from '@nestjs/common';
import { SkillDefinition } from '../types';
import {
  SkillRuntimeConflict,
  SkillRuntimeRecord,
  SkillRuntimeResolution,
  SkillRuntimeScope,
} from '../types/skill-runtime.types';
import { SkillVersionService } from './skill-version.service';

const SCOPE_PRIORITY: Record<SkillRuntimeScope, number> = {
  session: 5,
  project: 4,
  user: 3,
  remote: 2,
  builtin: 1,
};

@Injectable()
export class SkillScopeResolverService {
  constructor(private readonly versionService: SkillVersionService) {}

  resolveAll(skills: SkillDefinition[], options: { projectRoot?: string } = {}): SkillRuntimeResolution {
    const records = skills.map((skill) => this.toRecord(skill, options));
    const byName = new Map<string, SkillRuntimeRecord[]>();

    for (const record of records) {
      const key = record.name.toLowerCase();
      const list = byName.get(key) || [];
      list.push(record);
      byName.set(key, list);
    }

    for (const group of byName.values()) {
      group.sort((a, b) => SCOPE_PRIORITY[b.scope] - SCOPE_PRIORITY[a.scope]);
      const active = group.find((record) => record.status === 'active');
      if (!active) continue;
      active.shadows = group
        .filter((record) => record !== active)
        .map((record) => this.toRef(record));
      for (const record of group) {
        if (record !== active && record.status === 'active') {
          record.status = 'shadowed';
          record.shadowedBy = this.toRef(active);
        }
      }
    }

    const conflicts = this.findAliasConflicts(records);
    return { records, conflicts };
  }

  resolveSkill(name: string, skills: SkillDefinition[], options: { projectRoot?: string } = {}): SkillRuntimeRecord | undefined {
    const key = name.toLowerCase();
    const resolution = this.resolveAll(skills, options);
    return resolution.records.find((record) =>
      record.status === 'active'
      && (record.name.toLowerCase() === key || record.aliases.some((alias) => alias.toLowerCase() === key)),
    );
  }

  getConflicts(skills: SkillDefinition[], options: { projectRoot?: string } = {}): SkillRuntimeConflict[] {
    return this.resolveAll(skills, options).conflicts;
  }

  private toRecord(skill: SkillDefinition, options: { projectRoot?: string }): SkillRuntimeRecord {
    const status = skill.isActive === false
      ? 'disabled'
      : skill.trust === 'quarantined' || skill.risk === 'critical'
        ? 'quarantined'
        : 'active';
    return {
      name: skill.name,
      description: skill.description,
      aliases: skill.aliases || [],
      scope: this.determineScope(skill, options.projectRoot),
      sourcePath: skill.definitionPath || skill.sourcePath,
      packageRoot: skill.packageRoot,
      version: this.versionService.hashSkill(skill),
      status,
      activationReasons: [],
      supportFiles: (skill.supportFiles || []).map((file) => ({ path: file, bytes: 0, readable: true })),
      shadows: [],
      reload: { changedFiles: [], warnings: [], errors: [] },
    };
  }

  private determineScope(skill: SkillDefinition, projectRoot?: string): SkillRuntimeScope {
    const pathHint = `${skill.definitionPath || ''} ${skill.packageRoot || ''} ${skill.sourcePath || ''}`;
    if ((skill as any).runtimeScope) return (skill as any).runtimeScope;
    if (skill.source === 'remote') return 'remote';
    if (skill.source === 'builtin') return 'builtin';
    if (projectRoot && pathHint.includes(`${projectRoot}/.cast/skills`)) return 'project';
    if (pathHint.includes('/.cast/skills')) return 'user';
    return skill.source === 'local' ? 'project' : 'builtin';
  }

  private findAliasConflicts(records: SkillRuntimeRecord[]): SkillRuntimeConflict[] {
    const aliases = new Map<string, SkillRuntimeRecord[]>();
    for (const record of records.filter((item) => item.status === 'active')) {
      for (const alias of record.aliases) {
        const key = alias.toLowerCase();
        const list = aliases.get(key) || [];
        if (!list.some((item) => item.name === record.name && item.scope === record.scope)) {
          list.push(record);
        }
        aliases.set(key, list);
      }
    }
    return Array.from(aliases.entries())
      .filter(([, list]) => list.length > 1)
      .map(([alias, list]) => ({ alias, records: list.map((record) => this.toRef(record)) }));
  }

  private toRef(record: SkillRuntimeRecord) {
    return {
      name: record.name,
      scope: record.scope,
      sourcePath: record.sourcePath,
      version: record.version,
    };
  }
}
