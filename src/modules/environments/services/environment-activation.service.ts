import { Injectable } from '@nestjs/common';
import { BenchmarkStoreService } from '../../benchmark/services/benchmark-store.service';
import { PlatformConfigService } from '../../platform/services/platform-config.service';
import { StateDbService } from '../../state/services/state-db.service';
import { EnvironmentActivation, ResolvedCastEnvironmentManifest } from '../types';
import { DEFAULT_ENVIRONMENT_BENCHMARKS } from './environment-default-benchmarks';

@Injectable()
export class EnvironmentActivationService {
  constructor(
    private readonly dbService: StateDbService,
    private readonly platformConfig: PlatformConfigService,
    private readonly benchmarkStore: BenchmarkStoreService,
  ) {}

  async activate(
    projectRoot: string,
    manifest: ResolvedCastEnvironmentManifest,
    profileId?: string,
  ): Promise<EnvironmentActivation> {
    const activation: EnvironmentActivation = {
      projectRoot,
      environmentId: manifest.id,
      profileId,
      manifestSource: manifest.source,
      activatedAt: new Date().toISOString(),
      manifest,
    };

    await this.platformConfig.writeProjectEnvironment(projectRoot, manifest.id, profileId);
    await this.dbService.executeWrite((db) => {
      db.prepare(`
        insert into environment_activations (
          project_root, environment_id, profile_id, manifest_source, activated_at, manifest_json
        ) values (?, ?, ?, ?, ?, ?)
        on conflict(project_root) do update set
          environment_id = excluded.environment_id,
          profile_id = excluded.profile_id,
          manifest_source = excluded.manifest_source,
          activated_at = excluded.activated_at,
          manifest_json = excluded.manifest_json
      `).run(
        activation.projectRoot,
        activation.environmentId,
        activation.profileId ?? null,
        activation.manifestSource,
        activation.activatedAt,
        JSON.stringify(manifest),
      );
    });

    await this.seedDefaultBenchmarks(projectRoot, manifest);
    return activation;
  }

  async getActive(projectRoot: string): Promise<EnvironmentActivation | null> {
    const manifestEnvironment = await this.platformConfig.getProjectEnvironment(projectRoot);
    const manifestProfile = await this.platformConfig.getProjectEnvironmentProfile(projectRoot);
    const persisted = await this.getPersisted(projectRoot);
    if (manifestEnvironment) {
      return {
        projectRoot,
        environmentId: manifestEnvironment,
        profileId: manifestProfile ?? persisted?.profileId,
        manifestSource: persisted?.manifestSource ?? 'builtin',
        activatedAt: persisted?.activatedAt ?? new Date(0).toISOString(),
        manifest: persisted?.manifest,
      };
    }
    return persisted;
  }

  async seedDefaultBenchmarks(projectRoot: string, manifest: ResolvedCastEnvironmentManifest): Promise<string[]> {
    const existing = new Set((await this.benchmarkStore.listDefinitions(projectRoot)).map((definition) => definition.id));
    const seeded: string[] = [];

    for (const benchmarkId of manifest.benchmarks.smoke) {
      if (existing.has(benchmarkId)) {
        continue;
      }
      const factory = DEFAULT_ENVIRONMENT_BENCHMARKS[benchmarkId];
      if (!factory) {
        continue;
      }
      await this.benchmarkStore.saveDefinition(factory(projectRoot));
      seeded.push(benchmarkId);
      existing.add(benchmarkId);
    }

    return seeded;
  }

  private async getPersisted(projectRoot: string): Promise<EnvironmentActivation | null> {
    const db = await this.dbService.getDb();
    const row = db.prepare(`
      select project_root, environment_id, profile_id, manifest_source, activated_at, manifest_json
      from environment_activations
      where project_root = ?
      limit 1
    `).get(projectRoot) as {
      project_root: string;
      environment_id: string;
      profile_id: string | null;
      manifest_source: 'builtin' | 'project';
      activated_at: string;
      manifest_json: string | null;
    } | undefined;

    if (!row) {
      return null;
    }

    return {
      projectRoot: row.project_root,
      environmentId: row.environment_id,
      profileId: row.profile_id ?? undefined,
      manifestSource: row.manifest_source,
      activatedAt: row.activated_at,
      manifest: row.manifest_json ? JSON.parse(row.manifest_json) as ResolvedCastEnvironmentManifest : undefined,
    };
  }
}
