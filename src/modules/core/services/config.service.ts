import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { GLOBAL_CONFIG_DIR, DEFAULT_MODEL, DEFAULT_TEMPERATURE } from '../../../common/constants';

interface GlobalConfigFrontmatter {
  model?: string;
  temperature?: number;
  apiKey?: string;
  provider?: string;
  ollamaBaseUrl?: string;
}

//claude --resume 58524211-8ad1-4a73-a595-515e533e3c99

export interface GlobalConfig {
  model: string;
  temperature: number;
  apiKey: string;
  provider: string;
  ollamaBaseUrl: string;
}

@Injectable()
export class ConfigService {
  private config: GlobalConfig = {
    model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    apiKey: process.env.OPENAI_API_KEY || '',
    provider: process.env.LLM_PROVIDER || 'openai',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  };

  constructor(private readonly markdownParser: MarkdownParserService) {}

  async loadGlobalConfig() {
    const configPath = path.join(GLOBAL_CONFIG_DIR, 'config.md');

    if (await this.markdownParser.exists(configPath)) {
      const { frontmatter } =
        await this.markdownParser.parse<GlobalConfigFrontmatter>(configPath);

      this.config = {
        model: frontmatter.model || process.env.OLLAMA_MODEL || this.config.model,
        temperature: frontmatter.temperature ?? this.config.temperature,
        apiKey: frontmatter.apiKey || process.env.OPENAI_API_KEY || '',
        provider: frontmatter.provider || process.env.LLM_PROVIDER || this.config.provider,
        ollamaBaseUrl: frontmatter.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || this.config.ollamaBaseUrl,
      };
    }

    if (this.config.provider === 'openai' && !this.config.apiKey) {
      throw new Error(
        'OPENAI_API_KEY not configured. Set it in environment or ~/.cast/config.md',
      );
    }
  }

  getConfig(): GlobalConfig {
    return this.config;
  }

  getModel(): string {
    return this.config.model;
  }

  getTemperature(): number {
    return this.config.temperature;
  }

  getApiKey(): string {
    return this.config.apiKey;
  }

  getProvider(): string {
    return this.config.provider;
  }

  getOllamaBaseUrl(): string {
    return this.config.ollamaBaseUrl;
  }
}
