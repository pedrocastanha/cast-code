import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { SkillLoaderService } from './skill-loader.service';
import { collectSkillSupportFiles, isInside, normalizeSkillRelativePath } from './skill-asset-utils';
import { normalizeSkillContentForCast } from './skill-content-normalizer';

const DEFAULT_MAX_BYTES = 40 * 1024;

export type SkillAssetListResult =
  | { ok: true; skillName: string; files: string[] }
  | { ok: false; skillName: string; error: string };

export type SkillAssetReadResult =
  | {
      ok: true;
      skillName: string;
      filePath: string;
      content: string;
      truncated: boolean;
      bytes: number;
      maxBytes: number;
    }
  | { ok: false; skillName: string; filePath: string; error: string };

export interface SkillAssetReadOptions {
  maxBytes?: number;
}

@Injectable()
export class SkillAssetService {
  constructor(private readonly skillLoader: SkillLoaderService) {}

  async listSkillFiles(skillName: string): Promise<SkillAssetListResult> {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      return { ok: false, skillName, error: `Skill "${skillName}" not found or inactive.` };
    }

    const packageRoot = skill.packageRoot;
    if (!packageRoot) {
      return { ok: true, skillName: skill.name, files: [] };
    }

    try {
      const files = await collectSkillSupportFiles(packageRoot);
      return { ok: true, skillName: skill.name, files };
    } catch (error) {
      return {
        ok: false,
        skillName: skill.name,
        error: `Could not list support files: ${(error as Error).message}`,
      };
    }
  }

  async readSkillFile(
    skillName: string,
    filePath: string,
    options: SkillAssetReadOptions = {},
  ): Promise<SkillAssetReadResult> {
    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      return { ok: false, skillName, filePath, error: `Skill "${skillName}" not found or inactive.` };
    }

    if (!skill.packageRoot) {
      return {
        ok: false,
        skillName: skill.name,
        filePath,
        error: `Skill "${skill.name}" does not have a package root with support files.`,
      };
    }

    const normalizedPath = normalizeRequestedPath(filePath);
    if (!normalizedPath.ok) {
      return { ok: false, skillName: skill.name, filePath, error: normalizedPath.error };
    }

    const maxBytes = normalizeMaxBytes(options.maxBytes);

    try {
      const rootReal = await fs.realpath(skill.packageRoot);
      const targetPath = path.resolve(rootReal, normalizedPath.path);
      const targetReal = await fs.realpath(targetPath);

      if (!isInside(rootReal, targetReal)) {
        return {
          ok: false,
          skillName: skill.name,
          filePath,
          error: `Support file resolves outside package root: ${filePath}`,
        };
      }

      const stat = await fs.stat(targetReal);
      if (!stat.isFile()) {
        return { ok: false, skillName: skill.name, filePath, error: `Support path is not a file: ${filePath}` };
      }

      const binary = await isBinaryFile(targetReal);
      if (binary) {
        return { ok: false, skillName: skill.name, filePath, error: `Support file appears to be binary: ${filePath}` };
      }

      const readLength = Math.min(stat.size, maxBytes);
      const buffer = Buffer.alloc(readLength);
      if (readLength > 0) {
        const handle = await fs.open(targetReal, 'r');
        try {
          await handle.read(buffer, 0, readLength, 0);
        } finally {
          await handle.close();
        }
      }

      return {
        ok: true,
        skillName: skill.name,
        filePath: normalizedPath.path,
        content: normalizeSkillContentForCast(buffer.toString('utf-8')),
        truncated: stat.size > maxBytes,
        bytes: stat.size,
        maxBytes,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { ok: false, skillName: skill.name, filePath, error: `Support file not found: ${filePath}` };
      }
      return { ok: false, skillName: skill.name, filePath, error: err.message };
    }
  }
}

function normalizeRequestedPath(filePath: string): { ok: true; path: string } | { ok: false; error: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'filePath is required.' };
  }

  if (path.isAbsolute(filePath)) {
    return { ok: false, error: 'Support file path must be relative to the skill package root.' };
  }

  const normalized = normalizeSkillRelativePath(path.normalize(filePath)).replace(/^(\.\/)+/, '');
  if (!normalized || normalized === '.') {
    return { ok: false, error: 'Support file path is empty.' };
  }

  if (normalized.split('/').includes('..')) {
    return { ok: false, error: `Path traversal is blocked for support files: ${filePath}` };
  }

  return { ok: true, path: normalized };
}

function normalizeMaxBytes(maxBytes?: number): number {
  if (!Number.isFinite(maxBytes) || !maxBytes || maxBytes <= 0) {
    return DEFAULT_MAX_BYTES;
  }
  return Math.max(1, Math.floor(maxBytes));
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  const sample = Buffer.alloc(512);
  const handle = await fs.open(filePath, 'r');
  try {
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    return sample.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}
