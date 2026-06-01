import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as yaml from 'js-yaml';

import { SkillRisk, SkillTrust } from '../types';

const VALID_RISKS: SkillRisk[] = ['low', 'medium', 'high', 'critical'];
const VALID_TRUST: SkillTrust[] = ['builtin', 'trusted', 'community', 'local', 'quarantined'];

export interface SkillMetadataIndexLoadOptions {
  knownSkillNames?: string[];
  knownSourcePaths?: string[];
  validEnvironments?: string[];
}

export interface SkillMetadataEntry {
  name: string;
  sourcePath?: string;
  aliases: string[];
  category?: string;
  environments?: string[];
  profiles?: string[];
  triggers?: string[];
  risk?: SkillRisk;
  trust?: SkillTrust;
  activationPolicy?: string;
  isActive?: boolean;
}

export class LoadedSkillMetadataIndex {
  constructor(private readonly entries: SkillMetadataEntry[]) {}

  getEntries(): SkillMetadataEntry[] {
    return [...this.entries];
  }

  findForSkill(name: string): SkillMetadataEntry | undefined {
    const normalized = normalizeKey(name);
    return this.entries.find((entry) =>
      normalizeKey(entry.name) === normalized ||
      entry.aliases.map(normalizeKey).includes(normalized)
    );
  }

  findForSourcePath(sourcePath?: string): SkillMetadataEntry | undefined {
    if (!sourcePath) {
      return undefined;
    }
    const normalized = normalizeSourcePath(sourcePath);
    return this.entries.find((entry) => entry.sourcePath && normalizeSourcePath(entry.sourcePath) === normalized);
  }

  findForSkillOrSource(name: string, sourcePath?: string): SkillMetadataEntry | undefined {
    return this.findForSourcePath(sourcePath) ?? this.findForSkill(name);
  }
}

@Injectable()
export class SkillMetadataIndexService {
  async loadFromFile(
    filePath: string,
    options: SkillMetadataIndexLoadOptions = {},
  ): Promise<LoadedSkillMetadataIndex> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return new LoadedSkillMetadataIndex([]);
      }
      throw error;
    }

    const document = yaml.load(raw) as any;
    const entries = this.parse(document);
    this.validate(entries, options);
    return new LoadedSkillMetadataIndex(entries);
  }

  private parse(document: any): SkillMetadataEntry[] {
    if (!document || document.version !== 1 || !document.skills || typeof document.skills !== 'object') {
      throw new Error('Skill metadata index must declare version: 1 and a skills map.');
    }

    return Object.entries(document.skills).map(([name, value]) => {
      const record = (value ?? {}) as Record<string, unknown>;
      return {
        name,
        sourcePath: optionalString(record.sourcePath),
        aliases: stringArray(record.aliases),
        category: optionalString(record.category),
        environments: optionalStringArray(record.environments),
        profiles: optionalStringArray(record.profiles),
        triggers: optionalStringArray(record.triggers),
        risk: optionalEnum(record.risk, VALID_RISKS),
        trust: optionalEnum(record.trust, VALID_TRUST),
        activationPolicy: optionalString(record.activationPolicy),
        isActive: typeof record.isActive === 'boolean' ? record.isActive : undefined,
      };
    });
  }

  private validate(entries: SkillMetadataEntry[], options: SkillMetadataIndexLoadOptions): void {
    const errors: string[] = [];
    const knownSkillNames = new Set((options.knownSkillNames ?? []).map(normalizeKey));
    const knownSourcePaths = new Set((options.knownSourcePaths ?? []).map(normalizeSourcePath));
    const validEnvironments = new Set((options.validEnvironments ?? []).map(normalizeKey));
    const aliases = new Map<string, string>();
    const entryNames = new Set(entries.map((entry) => normalizeKey(entry.name)));

    for (const entry of entries) {
      const name = normalizeKey(entry.name);
      const sourcePath = entry.sourcePath ? normalizeSourcePath(entry.sourcePath) : '';

      if (knownSkillNames.size > 0 || knownSourcePaths.size > 0) {
        const knownByName = knownSkillNames.has(name);
        const knownBySource = sourcePath ? knownSourcePaths.has(sourcePath) : false;
        if (!knownByName && !knownBySource) {
          errors.push(`Unknown indexed skill "${entry.name}".`);
        }
      }

      for (const alias of entry.aliases) {
        const normalizedAlias = normalizeKey(alias);
        if (aliases.has(normalizedAlias)) {
          errors.push(`Duplicate alias "${alias}" on "${entry.name}" and "${aliases.get(normalizedAlias)}".`);
        } else {
          aliases.set(normalizedAlias, entry.name);
        }
        if (entryNames.has(normalizedAlias) && normalizedAlias !== name) {
          errors.push(`Alias "${alias}" collides with indexed skill name.`);
        }
      }

      for (const environment of entry.environments ?? []) {
        if (validEnvironments.size > 0 && !validEnvironments.has(normalizeKey(environment))) {
          errors.push(`Unknown environment "${environment}" on "${entry.name}".`);
        }
      }

      for (const profile of entry.profiles ?? []) {
        const environmentId = profile.split(':')[0] ?? '';
        if (validEnvironments.size > 0 && environmentId && !validEnvironments.has(normalizeKey(environmentId))) {
          errors.push(`Unknown profile environment "${environmentId}" on "${entry.name}".`);
        }
      }

      if (entry.risk === 'critical' && entry.isActive !== false) {
        errors.push(`Critical skill "${entry.name}" must declare isActive: false.`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Invalid skill metadata index:\n- ${errors.join('\n- ')}`);
    }
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function optionalStringArray(value: unknown): string[] | undefined {
  const values = stringArray(value);
  return values.length > 0 ? values : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim() as T;
  if (!values.includes(normalized)) {
    throw new Error(`Invalid enum value "${value}".`);
  }
  return normalized;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSourcePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^catalog\//, '');
}
