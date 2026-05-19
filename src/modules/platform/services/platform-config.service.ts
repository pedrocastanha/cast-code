import { Inject, Injectable, Optional } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { homedir } from 'node:os';
import { CastProjectManifest, PlatformConfig, PlatformLinkOptions } from '../types';

const DEFAULT_API_KEY_ENV = 'CAST_API_KEY';
const DEFAULT_API_URL = 'https://api.castplatform.dev';
const GLOBAL_CONFIG_FILE = path.join(homedir(), '.cast', 'config.yaml');
export const PLATFORM_GLOBAL_CONFIG_FILE = 'PLATFORM_GLOBAL_CONFIG_FILE';

interface GlobalPlatformConfig {
  apiKey?: string;
  apiUrl?: string;
}

@Injectable()
export class PlatformConfigService {
  private globalPlatformConfig: GlobalPlatformConfig = {};
  private readonly globalConfigFile: string;

  constructor(@Optional() @Inject(PLATFORM_GLOBAL_CONFIG_FILE) globalConfigFile?: string) {
    this.globalConfigFile = globalConfigFile || GLOBAL_CONFIG_FILE;
  }

  async readConfig(projectRoot: string): Promise<PlatformConfig> {
    const globalPlatform = await this.readGlobalPlatformConfig();
    const manifestPath = this.getManifestPath(projectRoot);
    const base = this.disabled(projectRoot, globalPlatform);

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
    const apiUrl = platform.apiUrl || globalPlatform.apiUrl || DEFAULT_API_URL;
    const apiKeyEnvError = this.validateApiKeyEnv(apiKeyEnv);
    if (apiKeyEnvError) {
      return { ...base, apiKeyEnv: DEFAULT_API_KEY_ENV, apiUrl, error: apiKeyEnvError };
    }
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
    const envKey = process.env[config.apiKeyEnv]?.trim();
    if (envKey) return envKey;
    return this.globalPlatformConfig.apiKey?.trim() || undefined;
  }

  async buildConfig(projectRoot: string, options: PlatformLinkOptions): Promise<PlatformConfig> {
    const globalPlatform = await this.readGlobalPlatformConfig();
    const requestedApiKeyEnv = options.apiKeyEnv || DEFAULT_API_KEY_ENV;
    const apiUrl = options.apiUrl || globalPlatform.apiUrl || DEFAULT_API_URL;
    const apiKeyEnvError = this.validateApiKeyEnv(requestedApiKeyEnv);
    const apiKeyEnv = apiKeyEnvError ? DEFAULT_API_KEY_ENV : requestedApiKeyEnv;
    const urlError = this.validateApiUrl(apiUrl);
    if (!options.projectId || urlError || apiKeyEnvError) {
      return {
        ...this.disabled(projectRoot, globalPlatform),
        apiKeyEnv,
        apiUrl,
        error: apiKeyEnvError || urlError || 'Platform project id is required.',
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
    const globalPlatform = await this.readGlobalPlatformConfig();
    const manifest = await this.readManifest(projectRoot);
    const previousApiKeyEnv = manifest.platform?.apiKeyEnv;
    const apiKeyEnv = options.apiKeyEnv
      || (previousApiKeyEnv && !this.validateApiKeyEnv(previousApiKeyEnv) ? previousApiKeyEnv : DEFAULT_API_KEY_ENV);
    const apiKeyEnvError = this.validateApiKeyEnv(apiKeyEnv);
    if (apiKeyEnvError) {
      throw new Error(apiKeyEnvError);
    }

    manifest.version = manifest.version || 1;
    manifest.platform = {
      ...(manifest.platform || {}),
      projectId: options.projectId,
      apiKeyEnv,
      apiUrl: options.apiUrl || manifest.platform?.apiUrl || globalPlatform.apiUrl || DEFAULT_API_URL,
    };

    await this.writeManifest(projectRoot, manifest);
  }

  async getProjectEnvironment(projectRoot: string): Promise<string | undefined> {
    const manifest = await this.readManifest(projectRoot);
    return manifest.project?.environment;
  }

  async getProjectEnvironmentProfile(projectRoot: string): Promise<string | undefined> {
    const manifest = await this.readManifest(projectRoot);
    return manifest.project?.environmentProfile;
  }

  async writeProjectEnvironment(projectRoot: string, environmentId: string, profileId?: string): Promise<void> {
    const manifest = await this.readManifest(projectRoot);
    manifest.version = manifest.version || 1;
    manifest.project = {
      ...(manifest.project || {}),
      environment: environmentId,
    };
    if (profileId) {
      manifest.project.environmentProfile = profileId;
    } else {
      delete manifest.project.environmentProfile;
    }
    await this.writeManifest(projectRoot, manifest);
  }

  private getManifestPath(projectRoot: string): string {
    return path.join(projectRoot, '.cast', 'cast.yaml');
  }

  private async readManifest(projectRoot: string): Promise<CastProjectManifest> {
    const manifestPath = this.getManifestPath(projectRoot);
    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      return (yaml.load(content) || {}) as CastProjectManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      return {};
    }
  }

  private async writeManifest(projectRoot: string, manifest: CastProjectManifest): Promise<void> {
    const castDir = path.join(projectRoot, '.cast');
    const manifestPath = this.getManifestPath(projectRoot);
    await fs.mkdir(castDir, { recursive: true });
    await fs.writeFile(manifestPath, yaml.dump(manifest, { lineWidth: 100 }), 'utf8');
  }

  private disabled(projectRoot: string, globalPlatform: GlobalPlatformConfig = {}): PlatformConfig {
    return {
      enabled: false,
      projectRoot,
      apiKeyEnv: DEFAULT_API_KEY_ENV,
      apiUrl: globalPlatform.apiUrl || DEFAULT_API_URL,
    };
  }

  private async readGlobalPlatformConfig(): Promise<GlobalPlatformConfig> {
    try {
      const content = await fs.readFile(this.globalConfigFile, 'utf8');
      const parsed = (yaml.load(content) || {}) as { platform?: unknown };
      const platform = parsed.platform;
      if (!platform || typeof platform !== 'object' || Array.isArray(platform)) {
        this.globalPlatformConfig = {};
        return this.globalPlatformConfig;
      }
      const apiKey = readOptionalString((platform as Record<string, unknown>).apiKey);
      const apiUrl = readOptionalString((platform as Record<string, unknown>).apiUrl);
      this.globalPlatformConfig = {
        ...(apiKey ? { apiKey } : {}),
        ...(apiUrl ? { apiUrl } : {}),
      };
      return this.globalPlatformConfig;
    } catch (error) {
      this.globalPlatformConfig = {};
      return this.globalPlatformConfig;
    }
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

  private validateApiKeyEnv(apiKeyEnv: string): string | undefined {
    const value = apiKeyEnv.trim();
    if (!value) {
      return 'Platform API key env must be an environment variable name like CAST_API_KEY.';
    }
    if (this.looksLikeApiKey(value)) {
      return 'Platform API key env must be an environment variable name like CAST_API_KEY, not the API key value.';
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      return 'Platform API key env must be a valid environment variable name like CAST_API_KEY.';
    }
    return undefined;
  }

  private looksLikeApiKey(value: string): boolean {
    return /^(csk|sk|sk-ant|sk-proj|sk-or|AIza)[_-]/i.test(value);
  }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
