import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { homedir } from 'os';
import {
  CastConfig,
  ModelConfig,
  ModelPurpose,
  ProviderType,
  ProvidersConfig,
  BaseProviderConfig,
  DEFAULT_EFFORT,
  EffortLevel,
  OllamaConfig,
  PlatformGlobalConfig,
  AzureDevopsGlobalConfig,
  AzureDevopsRepoConfig,
  ResolvedAzureConfig,
  providerRequiresBaseUrl,
  normalizeEffortLevel,
} from '../types/config.types';
import { I18nService } from '../../i18n/services/i18n.service';

const CONFIG_VERSION = 1;
const GLOBAL_CONFIG_DIR = path.join(homedir(), '.cast');
const CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'config.yaml');

const DEFAULT_CONFIG: CastConfig = {
  version: CONFIG_VERSION,
  providers: {},
  models: {
    default: {
      provider: 'openai',
      model: 'gpt-5-mini',
    },
  },
  effort: DEFAULT_EFFORT,
};

@Injectable()
export class ConfigManagerService {
  private config: CastConfig = DEFAULT_CONFIG;
  private loaded = false;

  constructor(private readonly i18nService: I18nService) {}

  async loadConfig(): Promise<CastConfig> {
    try {
      const content = await fs.readFile(CONFIG_FILE, 'utf-8');
      const parsed = yaml.load(content) as CastConfig;
      this.config = this.mergeWithDefaults(parsed);
      this.loaded = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Warning: Error reading config file:', (error as Error).message);
      }
      this.config = { ...DEFAULT_CONFIG };
      this.loaded = true;
    }
    if (this.config.language) {
      this.i18nService.setLanguage(this.config.language);
    }
    return this.config;
  }

  async saveConfig(config?: CastConfig): Promise<void> {
    const configToSave = config || this.config;
    configToSave.version = CONFIG_VERSION;

    await fs.mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
    await fs.writeFile(
      CONFIG_FILE,
      yaml.dump(configToSave, { indent: 2, lineWidth: 100 }),
      'utf-8'
    );

    if (config) {
      this.config = config;
    }
  }

  async configExists(): Promise<boolean> {
    try {
      await fs.access(CONFIG_FILE);
      return true;
    } catch {
      return false;
    }
  }

  getConfig(): CastConfig {
    if (!this.loaded) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  getModelConfig(purpose: ModelPurpose = 'default'): ModelConfig | undefined {
    return this.config.models[purpose] || this.config.models.default;
  }

  getEffort(): EffortLevel {
    return normalizeEffortLevel(this.config.effort) || DEFAULT_EFFORT;
  }

  getProviderConfig<T extends ProviderType>(
    provider: T
  ): ProvidersConfig[T] | undefined {
    return this.config.providers[provider];
  }

  getConfiguredProviders(): ProviderType[] {
    return Object.keys(this.config.providers) as ProviderType[];
  }

  isProviderConfigured(provider: ProviderType): boolean {
    const config = this.config.providers[provider];
    if (!config) return false;

    if (providerRequiresBaseUrl(provider)) {
      return !!(config as { baseUrl?: string }).baseUrl;
    }

    return !!(config as { apiKey?: string }).apiKey;
  }

  async addProvider(
    provider: ProviderType,
    config: { apiKey?: string; baseUrl?: string }
  ): Promise<void> {
    if (!this.config.providers) {
      this.config.providers = {};
    }
    if (providerRequiresBaseUrl(provider)) {
      if (!config.baseUrl) {
        throw new Error(`Provider "${provider}" requires a baseUrl`);
      }
      if (provider === 'ollama') {
        this.config.providers[provider] = { baseUrl: config.baseUrl } as OllamaConfig;
      } else {
        (this.config.providers as Record<string, BaseProviderConfig>)[provider] = {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
        };
      }
    } else {
      (this.config.providers as Record<string, BaseProviderConfig>)[provider] = config;
    }
    await this.saveConfig();
  }

  async setModel(purpose: ModelPurpose, modelConfig: ModelConfig): Promise<void> {
    if (!this.config.models) {
      this.config.models = {};
    }
    this.config.models[purpose] = modelConfig;
    await this.saveConfig();
  }

  async setEffort(level: EffortLevel): Promise<void> {
    this.config.effort = level;
    await this.saveConfig();
  }

  async setPlatformConfig(platform: PlatformGlobalConfig): Promise<void> {
    const apiKey = platform.apiKey?.trim();
    const apiUrl = platform.apiUrl?.trim();
    this.config.platform = {
      ...(apiKey ? { apiKey } : {}),
      ...(apiUrl ? { apiUrl } : {}),
    };
    await this.saveConfig();
  }

  getConfigPath(): string {
    return CONFIG_FILE;
  }

  /** Mask a secret for display, keeping only the last 4 chars. */
  static maskSecret(value?: string): string {
    if (!value) return '';
    const trimmed = value.trim();
    if (trimmed.length <= 4) return '••••';
    return `••••${trimmed.slice(-4)}`;
  }

  /** Path to the per-repo Azure config file. */
  private repoConfigPath(cwd: string): string {
    return path.join(cwd, '.cast', 'config.yaml');
  }

  getAzureGlobalConfig(): AzureDevopsGlobalConfig | undefined {
    return this.config.azureDevops;
  }

  /** Read per-repo Azure overrides from <cwd>/.cast/config.yaml. */
  async getAzureRepoConfig(cwd: string = process.cwd()): Promise<AzureDevopsRepoConfig | undefined> {
    try {
      const content = await fs.readFile(this.repoConfigPath(cwd), 'utf-8');
      const parsed = yaml.load(content) as { azureDevops?: AzureDevopsRepoConfig } | undefined;
      const repo = parsed?.azureDevops;
      if (!repo) return undefined;
      const repository = repo.repository?.trim();
      const targetBranch = repo.targetBranch?.trim();
      if (!repository && !targetBranch) return undefined;
      return {
        ...(repository ? { repository } : {}),
        ...(targetBranch ? { targetBranch } : {}),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Merge global Azure config with per-repo overrides (per-repo wins) and
   * remote-derived defaults (lowest precedence, supplied by the caller).
   * Returns undefined when the required global fields are absent.
   */
  async getAzureConfig(
    cwd: string = process.cwd(),
    remoteDefaults: Partial<AzureDevopsRepoConfig & Pick<AzureDevopsGlobalConfig, 'organizationUrl' | 'project'>> = {},
  ): Promise<ResolvedAzureConfig | undefined> {
    const global = this.config.azureDevops;
    if (!global?.pat) return undefined;

    const repo = await this.getAzureRepoConfig(cwd);
    const organizationUrl = global.organizationUrl || remoteDefaults.organizationUrl || '';
    const project = global.project || remoteDefaults.project || '';
    if (!organizationUrl || !project) return undefined;

    return {
      pat: global.pat,
      organizationUrl,
      project,
      ...(global.reviewers ? { reviewers: global.reviewers } : {}),
      repository: repo?.repository || remoteDefaults.repository,
      targetBranch: repo?.targetBranch || remoteDefaults.targetBranch,
    };
  }

  /** Persist global Azure fields to ~/.cast/config.yaml. Throws on missing required fields. */
  async setAzureGlobalConfig(cfg: AzureDevopsGlobalConfig): Promise<void> {
    const pat = cfg.pat?.trim();
    const organizationUrl = cfg.organizationUrl?.trim();
    const project = cfg.project?.trim();
    if (!pat) throw new Error('Personal Access Token is required');
    if (!organizationUrl) throw new Error('Organization URL is required');
    if (!project) throw new Error('Project is required');

    const reviewers = (cfg.reviewers || [])
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    this.config.azureDevops = {
      pat,
      organizationUrl,
      project,
      ...(reviewers.length > 0 ? { reviewers } : {}),
    };
    await this.saveConfig();
  }

  /** Persist per-repo Azure overrides to <cwd>/.cast/config.yaml and gitignore .cast/. */
  async setAzureRepoConfig(cwd: string, cfg: AzureDevopsRepoConfig): Promise<void> {
    const repository = cfg.repository?.trim();
    const targetBranch = cfg.targetBranch?.trim();
    const payload: { azureDevops?: AzureDevopsRepoConfig } = {};
    if (repository || targetBranch) {
      payload.azureDevops = {
        ...(repository ? { repository } : {}),
        ...(targetBranch ? { targetBranch } : {}),
      };
    }

    const dir = path.join(cwd, '.cast');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.repoConfigPath(cwd),
      yaml.dump(payload, { indent: 2, lineWidth: 100 }),
      'utf-8',
    );
    await this.ensureCastGitignored(cwd);
  }

  private async ensureCastGitignored(cwd: string): Promise<void> {
    const gitignorePath = path.join(cwd, '.gitignore');
    let current = '';
    try {
      current = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      current = '';
    }
    if (current.split('\n').some((l) => l.trim() === '.cast/')) return;
    await fs.writeFile(gitignorePath, `${current.replace(/\n*$/, '\n')}\n.cast/\n`, 'utf-8');
  }


  private mergeWithDefaults(parsed: CastConfig): CastConfig {
    return {
      version: parsed.version || CONFIG_VERSION,
      providers: parsed.providers || {},
      models: {
        ...DEFAULT_CONFIG.models,
        ...(parsed.models || {}),
      },
      effort: normalizeEffortLevel(parsed.effort) || DEFAULT_EFFORT,
      remote: parsed.remote,
      platform: normalizePlatformConfig(parsed.platform),
      azureDevops: normalizeAzureConfig(parsed.azureDevops),
      language: parsed.language,
    };
  }
}

function normalizeAzureConfig(
  azure: AzureDevopsGlobalConfig | undefined,
): AzureDevopsGlobalConfig | undefined {
  if (!azure) return undefined;
  const pat = typeof azure.pat === 'string' ? azure.pat.trim() : '';
  const organizationUrl = typeof azure.organizationUrl === 'string' ? azure.organizationUrl.trim() : '';
  const project = typeof azure.project === 'string' ? azure.project.trim() : '';
  if (!pat || !organizationUrl || !project) return undefined;
  const reviewers = Array.isArray(azure.reviewers)
    ? azure.reviewers.map((r) => String(r).trim()).filter((r) => r.length > 0)
    : [];
  return {
    pat,
    organizationUrl,
    project,
    ...(reviewers.length > 0 ? { reviewers } : {}),
  };
}

function normalizePlatformConfig(platform: PlatformGlobalConfig | undefined): PlatformGlobalConfig | undefined {
  if (!platform) return undefined;
  const apiKey = typeof platform.apiKey === 'string' ? platform.apiKey.trim() : '';
  const apiUrl = typeof platform.apiUrl === 'string' ? platform.apiUrl.trim() : '';
  if (!apiKey && !apiUrl) return undefined;
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(apiUrl ? { apiUrl } : {}),
  };
}
