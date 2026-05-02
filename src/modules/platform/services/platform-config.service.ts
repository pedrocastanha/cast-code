import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { CastProjectManifest, PlatformConfig, PlatformLinkOptions } from '../types';

const DEFAULT_API_KEY_ENV = 'CAST_API_KEY';
const DEFAULT_API_URL = 'https://api.castplatform.dev';

@Injectable()
export class PlatformConfigService {
  async readConfig(projectRoot: string): Promise<PlatformConfig> {
    const manifestPath = this.getManifestPath(projectRoot);
    const base = this.disabled(projectRoot);

    let manifest: CastProjectManifest;
    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      manifest = (yaml.load(content) || {}) as CastProjectManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return base;
      }
      return { ...base, error: `Invalid .cast/cast.yaml: ${(error as Error).message}` };
    }

    const platform = manifest.platform;
    if (!platform?.projectId) {
      return base;
    }

    const apiKeyEnv = platform.apiKeyEnv || DEFAULT_API_KEY_ENV;
    const apiUrl = platform.apiUrl || DEFAULT_API_URL;
    const urlError = this.validateApiUrl(apiUrl);
    if (urlError) {
      return { ...base, apiKeyEnv, apiUrl, error: urlError };
    }

    return {
      enabled: true,
      projectRoot,
      projectId: platform.projectId,
      apiKeyEnv,
      apiUrl,
    };
  }

  getApiKey(config: PlatformConfig): string | undefined {
    return process.env[config.apiKeyEnv];
  }

  buildConfig(projectRoot: string, options: PlatformLinkOptions): PlatformConfig {
    const apiKeyEnv = options.apiKeyEnv || DEFAULT_API_KEY_ENV;
    const apiUrl = options.apiUrl || DEFAULT_API_URL;
    const urlError = this.validateApiUrl(apiUrl);
    if (!options.projectId || urlError) {
      return {
        ...this.disabled(projectRoot),
        apiKeyEnv,
        apiUrl,
        error: urlError || 'Platform project id is required.',
      };
    }
    return {
      enabled: true,
      projectRoot,
      projectId: options.projectId,
      apiKeyEnv,
      apiUrl,
    };
  }

  async writeLink(projectRoot: string, options: PlatformLinkOptions): Promise<void> {
    const castDir = path.join(projectRoot, '.cast');
    const manifestPath = this.getManifestPath(projectRoot);
    await fs.mkdir(castDir, { recursive: true });

    let manifest: CastProjectManifest = {};
    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      manifest = (yaml.load(content) || {}) as CastProjectManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    manifest.version = manifest.version || 1;
    manifest.platform = {
      ...(manifest.platform || {}),
      projectId: options.projectId,
      apiKeyEnv: options.apiKeyEnv || manifest.platform?.apiKeyEnv || DEFAULT_API_KEY_ENV,
      apiUrl: options.apiUrl || manifest.platform?.apiUrl || DEFAULT_API_URL,
    };

    await fs.writeFile(manifestPath, yaml.dump(manifest, { lineWidth: 100 }), 'utf8');
  }

  private getManifestPath(projectRoot: string): string {
    return path.join(projectRoot, '.cast', 'cast.yaml');
  }

  private disabled(projectRoot: string): PlatformConfig {
    return {
      enabled: false,
      projectRoot,
      apiKeyEnv: DEFAULT_API_KEY_ENV,
      apiUrl: DEFAULT_API_URL,
    };
  }

  private validateApiUrl(apiUrl: string): string | undefined {
    try {
      const parsed = new URL(apiUrl);
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
        return 'Platform apiUrl must use HTTPS unless it points to localhost.';
      }
      return undefined;
    } catch {
      return 'Platform apiUrl is invalid.';
    }
  }
}
