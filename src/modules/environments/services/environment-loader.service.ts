import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
  CastEnvironmentSource,
  ResolvedCastEnvironmentManifest,
  castEnvironmentManifestSchema,
} from '../types';

const MANIFEST_PATTERN = /\.cast-env\.ya?ml$/;

@Injectable()
export class EnvironmentLoaderService {
  private readonly builtinDir = path.join(__dirname, '..', 'manifests');

  async list(projectRoot: string = process.cwd()): Promise<ResolvedCastEnvironmentManifest[]> {
    const byId = new Map<string, ResolvedCastEnvironmentManifest>();

    for (const manifest of await this.loadDirectory(this.builtinDir, 'builtin')) {
      byId.set(manifest.id, manifest);
    }

    for (const manifest of await this.loadProjectManifests(projectRoot)) {
      byId.set(manifest.id, manifest);
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string, projectRoot: string = process.cwd()): Promise<ResolvedCastEnvironmentManifest | null> {
    const normalized = id.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const environments = await this.list(projectRoot);
    return environments.find((environment) =>
      environment.id === normalized || environment.name.toLowerCase() === normalized
    ) ?? null;
  }

  async loadProjectManifests(projectRoot: string): Promise<ResolvedCastEnvironmentManifest[]> {
    return this.loadDirectory(path.join(projectRoot, '.cast', 'environments'), 'project', { skipInvalid: true });
  }

  private async loadDirectory(
    directory: string,
    expectedSource: CastEnvironmentSource,
    options: { skipInvalid?: boolean } = {},
  ): Promise<ResolvedCastEnvironmentManifest[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const manifests: ResolvedCastEnvironmentManifest[] = [];
    for (const entry of entries.filter((name) => MANIFEST_PATTERN.test(name)).sort()) {
      const filePath = path.join(directory, entry);
      try {
        manifests.push(await this.loadFile(filePath, expectedSource));
      } catch (error) {
        if (!options.skipInvalid) {
          throw error;
        }
      }
    }
    return manifests;
  }

  private async loadFile(filePath: string, expectedSource: CastEnvironmentSource): Promise<ResolvedCastEnvironmentManifest> {
    const raw = yaml.load(await fs.readFile(filePath, 'utf8'));
    const parsed = castEnvironmentManifestSchema.parse(raw);
    if (expectedSource === 'project' && parsed.source !== 'project') {
      throw new Error(`Project environment manifest ${filePath} must declare source: project`);
    }
    const source = parsed.source ?? expectedSource;
    if (source !== expectedSource) {
      throw new Error(`Environment manifest ${filePath} must declare source: ${expectedSource}`);
    }
    return {
      ...parsed,
      source,
      filePath,
    };
  }
}
