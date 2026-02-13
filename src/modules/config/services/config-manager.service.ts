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
} from '../types/config.types';

const CONFIG_VERSION = 1;
const GLOBAL_CONFIG_DIR = path.join(homedir(), '.cast');
const CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'config.yaml');

const DEFAULT_CONFIG: CastConfig = {
  version: CONFIG_VERSION,
  providers: {},
  models: {
    default: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.1,
    },
  },
};

@Injectable()
export class ConfigManagerService {
  private config: CastConfig = DEFAULT_CONFIG;
  private loaded = false;

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

    // Ollama doesn't require API key
    if (provider === 'ollama') {
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
    this.config.providers[provider] = config;
    await this.saveConfig();
  }

  async setModel(purpose: ModelPurpose, modelConfig: ModelConfig): Promise<void> {
    if (!this.config.models) {
      this.config.models = {};
    }
    this.config.models[purpose] = modelConfig;
    await this.saveConfig();
  }

  getConfigPath(): string {
    return CONFIG_FILE;
  }

  private mergeWithDefaults(parsed: CastConfig): CastConfig {
    return {
      version: parsed.version || CONFIG_VERSION,
      providers: parsed.providers || {},
      models: {
        ...DEFAULT_CONFIG.models,
        ...(parsed.models || {}),
      },
    };
  }
}
