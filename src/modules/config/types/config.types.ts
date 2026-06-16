export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'kimi'
  | 'qwen'
  | 'glm'
  | 'mistral'
  | 'xai'
  | 'groq'
  | 'cohere'
  | 'perplexity'
  | 'together'
  | 'fireworks'
  | 'huggingface'
  | 'cerebras'
  | 'ollama'
  | 'selfhosted'
  | 'deepseek'
  | 'openrouter';

export interface BaseProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface OpenAIConfig extends BaseProviderConfig { }
export interface AnthropicConfig extends BaseProviderConfig { }
export interface GeminiConfig extends BaseProviderConfig { }
export interface KimiConfig extends BaseProviderConfig { }
export interface QwenConfig extends BaseProviderConfig { }
export interface GlmConfig extends BaseProviderConfig { }
export interface MistralConfig extends BaseProviderConfig { }
export interface XaiConfig extends BaseProviderConfig { }
export interface GroqConfig extends BaseProviderConfig { }
export interface CohereConfig extends BaseProviderConfig { }
export interface PerplexityConfig extends BaseProviderConfig { }
export interface TogetherConfig extends BaseProviderConfig { }
export interface FireworksConfig extends BaseProviderConfig { }
export interface HuggingFaceConfig extends BaseProviderConfig { }
export interface CerebrasConfig extends BaseProviderConfig { }
export interface DeepSeekConfig extends BaseProviderConfig { }
export interface OpenRouterConfig extends BaseProviderConfig { }
export interface SelfHostedConfig extends BaseProviderConfig { }

export interface OllamaConfig {
  baseUrl: string;
}

export interface ProvidersConfig {
  openai?: OpenAIConfig;
  anthropic?: AnthropicConfig;
  gemini?: GeminiConfig;
  kimi?: KimiConfig;
  qwen?: QwenConfig;
  glm?: GlmConfig;
  mistral?: MistralConfig;
  xai?: XaiConfig;
  groq?: GroqConfig;
  cohere?: CohereConfig;
  perplexity?: PerplexityConfig;
  together?: TogetherConfig;
  fireworks?: FireworksConfig;
  huggingface?: HuggingFaceConfig;
  cerebras?: CerebrasConfig;
  deepseek?: DeepSeekConfig;
  openrouter?: OpenRouterConfig;
  ollama?: OllamaConfig;
  selfhosted?: SelfHostedConfig;
}

export interface ModelConfig {
  provider: ProviderType;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export type EffortLevel = 'fast' | 'balanced' | 'deep' | 'max';

export interface EffortProfile {
  level: EffortLevel;
  label: string;
  description: string;
  modelBias: 'cheap' | 'default' | 'quality';
  maxOutputTokens: number;
  maxToolCalls: number;
  includeProjectStructure: 'minimal' | 'standard' | 'full';
  planning: 'off' | 'suggest' | 'prefer';
  review: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export type ModelPurpose =
  | 'default'
  | 'subAgent'
  | 'coder'
  | 'architect'
  | 'reviewer'
  | 'planner'
  | 'tester'
  | 'cheap';

export type ModelsConfig = Partial<Record<ModelPurpose, ModelConfig>>;

export interface RemoteConfig {
  enabled: boolean;
  password?: string;
  openaiApiKey?: string;
  ngrokAuthToken?: string;
}

export interface PlatformGlobalConfig {
  apiKey?: string;
  apiUrl?: string;
}

/** Global Azure DevOps settings (stored in ~/.cast/config.yaml). */
export interface AzureDevopsGlobalConfig {
  /** Personal Access Token; delivered to `az` via AZURE_DEVOPS_EXT_PAT, never on argv. */
  pat: string;
  /** Organization URL, e.g. https://dev.azure.com/myorg — maps to `--organization`. */
  organizationUrl: string;
  /** Project name or id — maps to `--project`. */
  project: string;
  /** Optional required reviewers — maps to `--required-reviewers`. */
  reviewers?: string[];
}

/** Per-repo Azure DevOps overrides (stored in <repo>/.cast/config.yaml). */
export interface AzureDevopsRepoConfig {
  /** Repository name — maps to `--repository`; defaults from the git remote. */
  repository?: string;
  /** Target branch — maps to `--target-branch`; defaults to the repo default branch. */
  targetBranch?: string;
}

/** Global + per-repo Azure config merged with remote-derived defaults. */
export interface ResolvedAzureConfig
  extends AzureDevopsGlobalConfig,
    AzureDevopsRepoConfig {}

export interface CastConfig {
  version: number;
  language?: 'en' | 'pt';
  providers: ProvidersConfig;
  models: ModelsConfig;
  effort?: EffortLevel;
  remote?: RemoteConfig;
  platform?: PlatformGlobalConfig;
  azureDevops?: AzureDevopsGlobalConfig;
}

export interface ProviderMetadata {
  type: ProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  websiteUrl: string;
  popularModels: string[];
  recommendedModels?: Partial<Record<ModelPurpose, string>>;
  setupHints?: string[];
  exampleBaseUrls?: string[];
}

export type ProviderEndpointKind = 'official' | 'compatible' | 'local';

export const PROVIDERS_WITH_REQUIRED_BASE_URL = [
  'ollama',
  'selfhosted',
] as const satisfies readonly ProviderType[];

export const PROVIDERS_WITH_OPTIONAL_API_KEY = [
  'selfhosted',
] as const satisfies readonly ProviderType[];

export const OPENAI_COMPATIBLE_PROVIDERS = [
  'openai',
  'kimi',
  'qwen',
  'glm',
  'mistral',
  'xai',
  'groq',
  'cohere',
  'perplexity',
  'together',
  'fireworks',
  'huggingface',
  'cerebras',
  'deepseek',
  'openrouter',
  'ollama',
  'selfhosted',
] as const satisfies readonly ProviderType[];

export function providerRequiresBaseUrl(provider: ProviderType): boolean {
  return PROVIDERS_WITH_REQUIRED_BASE_URL.includes(
    provider as (typeof PROVIDERS_WITH_REQUIRED_BASE_URL)[number]
  );
}

export function providerAllowsOptionalApiKey(provider: ProviderType): boolean {
  return PROVIDERS_WITH_OPTIONAL_API_KEY.includes(
    provider as (typeof PROVIDERS_WITH_OPTIONAL_API_KEY)[number]
  );
}

export function providerSupportsApiKey(provider: ProviderType): boolean {
  return provider !== 'ollama';
}

export function providerUsesOpenAICompatibleApi(provider: ProviderType): boolean {
  return OPENAI_COMPATIBLE_PROVIDERS.includes(
    provider as (typeof OPENAI_COMPATIBLE_PROVIDERS)[number]
  );
}

export function getProviderEndpointKind(provider: ProviderType): ProviderEndpointKind {
  if (provider === 'ollama') {
    return 'local';
  }

  if (provider === 'selfhosted' || providerUsesOpenAICompatibleApi(provider)) {
    return provider === 'openai' ? 'official' : 'compatible';
  }

  return 'official';
}

export function getProviderEndpointLabel(provider: ProviderType): string {
  switch (getProviderEndpointKind(provider)) {
  case 'local':
    return 'local runtime';
  case 'compatible':
    return 'openai-compatible';
  case 'official':
  default:
    return 'official api';
  }
}

export function getRecommendedModel(
  provider: ProviderType,
  purpose: ModelPurpose
): string | undefined {
  const metadata = PROVIDER_METADATA[provider];
  return metadata.recommendedModels?.[purpose] || metadata.recommendedModels?.default;
}

export function getModelChoicesForPurpose(
  provider: ProviderType,
  purpose: ModelPurpose
): Array<{ label: string; value: string }> {
  const metadata = PROVIDER_METADATA[provider];
  const recommended = getRecommendedModel(provider, purpose);
  const values = recommended
    ? [recommended, ...metadata.popularModels.filter((model) => model !== recommended)]
    : metadata.popularModels;

  return values.map((value, index) => ({
    value,
    label: index === 0 && recommended === value ? `${value} (recommended)` : value,
  }));
}

export function isRecommendedModelForPurpose(
  provider: ProviderType,
  purpose: ModelPurpose,
  model: string
): boolean {
  const recommended = getRecommendedModel(provider, purpose);
  return !!recommended && recommended.toLowerCase() === model.toLowerCase();
}

export const PROVIDER_METADATA: Record<ProviderType, ProviderMetadata> = {
  openai: {
    type: 'openai',
    name: 'OpenAI',
    description: 'GPT-5.4, GPT-5 Codex, GPT-5 mini e família GPT atual',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    websiteUrl: 'https://platform.openai.com',
    popularModels: [
      'gpt-5.4',
      'gpt-5.4-pro',
      'gpt-5.3-codex',
      'gpt-5.2',
      'gpt-5.2-codex',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4.1',
      'gpt-4.1-mini',
    ],
    recommendedModels: {
      default: 'gpt-5-mini',
      subAgent: 'gpt-5-mini',
      coder: 'gpt-5.3-codex',
      architect: 'gpt-5.4',
      reviewer: 'gpt-5.4',
      planner: 'gpt-5.4',
      tester: 'gpt-5-mini',
      cheap: 'gpt-4.1-mini',
    },
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Sonnet 4.5, Haiku 4.5 e Opus 4.1',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com',
    websiteUrl: 'https://console.anthropic.com',
    popularModels: [
      'claude-sonnet-4-5',
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-1',
      'claude-opus-4-1-20250805',
    ],
    recommendedModels: {
      default: 'claude-sonnet-4-5',
      subAgent: 'claude-haiku-4-5',
      coder: 'claude-sonnet-4-5',
      architect: 'claude-opus-4-1',
      reviewer: 'claude-sonnet-4-5',
      planner: 'claude-sonnet-4-5',
      tester: 'claude-haiku-4-5',
      cheap: 'claude-haiku-4-5',
    },
  },
  gemini: {
    type: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.5 Pro, Flash e Flash-Lite',
    requiresApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    websiteUrl: 'https://ai.google.dev',
    popularModels: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ],
    recommendedModels: {
      default: 'gemini-2.5-flash',
      subAgent: 'gemini-2.5-flash-lite',
      coder: 'gemini-2.5-pro',
      architect: 'gemini-2.5-pro',
      reviewer: 'gemini-2.5-flash',
      planner: 'gemini-2.5-flash',
      tester: 'gemini-2.5-flash-lite',
      cheap: 'gemini-2.5-flash-lite',
    },
  },
  kimi: {
    type: 'kimi',
    name: 'Moonshot Kimi',
    description: 'Kimi K2.6 e modelos K2 via OpenAI compatibility',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    websiteUrl: 'https://platform.kimi.ai',
    popularModels: [
      'kimi-k2.6',
      'kimi-k2.5',
      'kimi-k2-thinking',
      'kimi-k2-turbo-preview',
      'kimi-k2-0905-preview',
    ],
    recommendedModels: {
      default: 'kimi-k2.6',
      subAgent: 'kimi-k2-turbo-preview',
      coder: 'kimi-k2.6',
      architect: 'kimi-k2-thinking',
      reviewer: 'kimi-k2.6',
      planner: 'kimi-k2-thinking',
      tester: 'kimi-k2-turbo-preview',
      cheap: 'kimi-k2-turbo-preview',
    },
  },
  qwen: {
    type: 'qwen',
    name: 'Qwen / DashScope',
    description: 'Qwen comerciais via endpoint OpenAI-compatible da Alibaba',
    requiresApiKey: true,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    websiteUrl: 'https://help.aliyun.com/zh/model-studio/qwen-api-via-dashscope',
    popularModels: [
      'qwen3-235b-a22b-instruct-2507',
      'qwen3-235b-a22b-thinking-2507',
      'qwen-max-latest',
      'qwen-plus-latest',
      'qwen-turbo-latest',
      'qwen3-coder-plus',
    ],
    recommendedModels: {
      default: 'qwen-plus-latest',
      subAgent: 'qwen-turbo-latest',
      coder: 'qwen3-coder-plus',
      architect: 'qwen3-235b-a22b-thinking-2507',
      reviewer: 'qwen-plus-latest',
      planner: 'qwen3-235b-a22b-thinking-2507',
      tester: 'qwen-turbo-latest',
      cheap: 'qwen-turbo-latest',
    },
  },
  glm: {
    type: 'glm',
    name: 'GLM / BigModel',
    description: 'GLM-4.6 e GLM-4.5 via endpoint OpenAI-compatible da Zhipu',
    requiresApiKey: true,
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    websiteUrl: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-4.6',
    popularModels: [
      'glm-4.6',
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5-flash',
    ],
    recommendedModels: {
      default: 'glm-4.5-air',
      subAgent: 'glm-4.5-flash',
      coder: 'glm-4.6',
      architect: 'glm-4.6',
      reviewer: 'glm-4.5-air',
      planner: 'glm-4.5-air',
      tester: 'glm-4.5-flash',
      cheap: 'glm-4.5-flash',
    },
  },
  mistral: {
    type: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral Large/Medium, Codestral, Devstral e Magistral',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    websiteUrl: 'https://docs.mistral.ai/models/overview',
    popularModels: [
      'mistral-large-latest',
      'mistral-medium-latest',
      'mistral-small-latest',
      'codestral-latest',
      'devstral-latest',
      'magistral-medium-latest',
      'ministral-14b-latest',
      'ministral-8b-latest',
    ],
    recommendedModels: {
      default: 'mistral-medium-latest',
      subAgent: 'mistral-small-latest',
      coder: 'codestral-latest',
      architect: 'mistral-large-latest',
      reviewer: 'mistral-medium-latest',
      planner: 'magistral-medium-latest',
      tester: 'mistral-small-latest',
      cheap: 'ministral-8b-latest',
    },
  },
  xai: {
    type: 'xai',
    name: 'xAI Grok',
    description: 'Grok 4.3, Grok 4.1 Fast e Grok Code via API xAI',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.x.ai/v1',
    websiteUrl: 'https://docs.x.ai/docs/models',
    popularModels: [
      'grok-4.3',
      'grok-4.20',
      'grok-4-1-fast-reasoning',
      'grok-4-1-fast-non-reasoning',
      'grok-code-fast-1',
      'grok-4',
    ],
    recommendedModels: {
      default: 'grok-4.3',
      subAgent: 'grok-4-1-fast-non-reasoning',
      coder: 'grok-code-fast-1',
      architect: 'grok-4.3',
      reviewer: 'grok-4.3',
      planner: 'grok-4-1-fast-reasoning',
      tester: 'grok-4-1-fast-non-reasoning',
      cheap: 'grok-4-1-fast-non-reasoning',
    },
  },
  groq: {
    type: 'groq',
    name: 'Groq',
    description: 'Inferencia rapida para GPT-OSS, Llama, Qwen e DeepSeek',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    websiteUrl: 'https://console.groq.com/docs/models',
    popularModels: [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'qwen/qwen3-32b',
      'deepseek-r1-distill-llama-70b',
      'meta-llama/llama-4-scout-17b-16e-instruct',
    ],
    recommendedModels: {
      default: 'openai/gpt-oss-120b',
      subAgent: 'openai/gpt-oss-20b',
      coder: 'qwen/qwen3-32b',
      architect: 'openai/gpt-oss-120b',
      reviewer: 'openai/gpt-oss-120b',
      planner: 'deepseek-r1-distill-llama-70b',
      tester: 'llama-3.1-8b-instant',
      cheap: 'llama-3.1-8b-instant',
    },
  },
  cohere: {
    type: 'cohere',
    name: 'Cohere',
    description: 'Command A+, Command A e Command R via Compatibility API',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.cohere.ai/compatibility/v1',
    websiteUrl: 'https://docs.cohere.com/docs/models',
    popularModels: [
      'command-a-plus-05-2026',
      'command-a-03-2025',
      'command-a-reasoning-08-2025',
      'command-r7b-12-2024',
      'command-r-plus',
      'c4ai-aya-expanse-32b',
      'tiny-aya-global',
    ],
    recommendedModels: {
      default: 'command-a-plus-05-2026',
      subAgent: 'command-r7b-12-2024',
      coder: 'command-a-plus-05-2026',
      architect: 'command-a-plus-05-2026',
      reviewer: 'command-a-03-2025',
      planner: 'command-a-reasoning-08-2025',
      tester: 'command-r7b-12-2024',
      cheap: 'command-r7b-12-2024',
    },
  },
  perplexity: {
    type: 'perplexity',
    name: 'Perplexity Sonar',
    description: 'Sonar com busca, reasoning e deep research',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.perplexity.ai',
    websiteUrl: 'https://docs.perplexity.ai',
    popularModels: [
      'sonar',
      'sonar-pro',
      'sonar-reasoning',
      'sonar-reasoning-pro',
      'sonar-deep-research',
    ],
    recommendedModels: {
      default: 'sonar-pro',
      subAgent: 'sonar',
      coder: 'sonar-pro',
      architect: 'sonar-reasoning-pro',
      reviewer: 'sonar-pro',
      planner: 'sonar-reasoning-pro',
      tester: 'sonar',
      cheap: 'sonar',
    },
  },
  together: {
    type: 'together',
    name: 'Together AI',
    description: 'Open models e frontier alternatives via API OpenAI-compatible',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.together.ai/v1',
    websiteUrl: 'https://docs.together.ai',
    popularModels: [
      'moonshotai/Kimi-K2.5',
      'deepseek-ai/DeepSeek-R1',
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'Qwen/Qwen3-235B-A22B',
      'Qwen/Qwen3-32B',
      'google/gemma-3-27b-it',
    ],
    recommendedModels: {
      default: 'moonshotai/Kimi-K2.5',
      subAgent: 'Qwen/Qwen3-32B',
      coder: 'Qwen/Qwen3-235B-A22B',
      architect: 'deepseek-ai/DeepSeek-R1',
      reviewer: 'moonshotai/Kimi-K2.5',
      planner: 'deepseek-ai/DeepSeek-R1',
      tester: 'Qwen/Qwen3-32B',
      cheap: 'google/gemma-3-27b-it',
    },
  },
  fireworks: {
    type: 'fireworks',
    name: 'Fireworks AI',
    description: 'Serverless inference para modelos open-weight e agenticos',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
    websiteUrl: 'https://docs.fireworks.ai/guides/querying-text-models',
    popularModels: [
      'accounts/fireworks/models/deepseek-v3p1',
      'accounts/fireworks/models/kimi-k2-instruct-0905',
      'accounts/fireworks/models/qwen3-235b-a22b',
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
      'accounts/fireworks/models/gpt-oss-120b',
    ],
    recommendedModels: {
      default: 'accounts/fireworks/models/deepseek-v3p1',
      subAgent: 'accounts/fireworks/models/gpt-oss-120b',
      coder: 'accounts/fireworks/models/qwen3-235b-a22b',
      architect: 'accounts/fireworks/models/kimi-k2-instruct-0905',
      reviewer: 'accounts/fireworks/models/deepseek-v3p1',
      planner: 'accounts/fireworks/models/deepseek-v3p1',
      tester: 'accounts/fireworks/models/gpt-oss-120b',
      cheap: 'accounts/fireworks/models/gpt-oss-120b',
    },
  },
  huggingface: {
    type: 'huggingface',
    name: 'Hugging Face Inference Router',
    description: 'Inference Providers com endpoint OpenAI-compatible',
    requiresApiKey: true,
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    websiteUrl: 'https://huggingface.co/docs/inference-providers',
    popularModels: [
      'openai/gpt-oss-120b',
      'deepseek-ai/DeepSeek-R1:fastest',
      'Qwen/Qwen3-32B',
      'google/gemma-3-27b-it',
      'meta-llama/Llama-3.3-70B-Instruct',
      'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
    ],
    recommendedModels: {
      default: 'openai/gpt-oss-120b',
      subAgent: 'Qwen/Qwen3-32B',
      coder: 'Qwen/Qwen3-32B',
      architect: 'deepseek-ai/DeepSeek-R1:fastest',
      reviewer: 'openai/gpt-oss-120b',
      planner: 'deepseek-ai/DeepSeek-R1:fastest',
      tester: 'google/gemma-3-27b-it',
      cheap: 'google/gemma-3-27b-it',
    },
  },
  cerebras: {
    type: 'cerebras',
    name: 'Cerebras Inference',
    description: 'Inferencia de baixa latencia para GPT-OSS, Qwen e GLM',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    websiteUrl: 'https://inference-docs.cerebras.ai',
    popularModels: [
      'gpt-oss-120b',
      'gpt-oss-20b',
      'qwen-3-32b',
      'qwen-3-235b-a22b-instruct-2507',
      'zai-glm-4.7',
    ],
    recommendedModels: {
      default: 'gpt-oss-120b',
      subAgent: 'gpt-oss-20b',
      coder: 'qwen-3-32b',
      architect: 'gpt-oss-120b',
      reviewer: 'gpt-oss-120b',
      planner: 'zai-glm-4.7',
      tester: 'gpt-oss-20b',
      cheap: 'gpt-oss-20b',
    },
  },
  deepseek: {
    type: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V4 Pro/Flash e aliases legados',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.deepseek.com',
    websiteUrl: 'https://platform.deepseek.com',
    popularModels: [
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    recommendedModels: {
      default: 'deepseek-v4-flash',
      subAgent: 'deepseek-v4-flash',
      coder: 'deepseek-v4-pro',
      architect: 'deepseek-reasoner',
      reviewer: 'deepseek-v4-pro',
      planner: 'deepseek-reasoner',
      tester: 'deepseek-v4-flash',
      cheap: 'deepseek-chat',
    },
  },
  openrouter: {
    type: 'openrouter',
    name: 'OpenRouter',
    description: 'Acesso a múltiplos modelos via uma API OpenAI-compatible',
    requiresApiKey: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    websiteUrl: 'https://openrouter.ai',
    popularModels: [
      'moonshotai/kimi-k2.6',
      'openai/gpt-5.4',
      'anthropic/claude-sonnet-4.5',
      'google/gemini-2.5-pro',
      'z-ai/glm-4.6',
      'qwen/qwen3-235b-a22b',
      'deepseek/deepseek-v4-pro',
      'google/gemma-3-27b-it',
      'meta-llama/llama-4-maverick',
    ],
    recommendedModels: {
      default: 'moonshotai/kimi-k2.6',
      subAgent: 'google/gemini-2.5-pro',
      coder: 'moonshotai/kimi-k2.6',
      architect: 'anthropic/claude-sonnet-4.5',
      reviewer: 'anthropic/claude-sonnet-4.5',
      planner: 'google/gemini-2.5-pro',
      tester: 'google/gemma-3-27b-it',
      cheap: 'google/gemma-3-27b-it',
    },
  },
  ollama: {
    type: 'ollama',
    name: 'Ollama (Local)',
    description: 'Modelos locais via runtime nativo Ollama',
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:11434',
    websiteUrl: 'https://ollama.com',
    popularModels: [
      'gpt-oss:20b',
      'llama3.3',
      'qwen3',
      'gemma3',
      'deepseek-r1',
      'mistral',
      'glm4',
    ],
    recommendedModels: {
      default: 'gpt-oss:20b',
      subAgent: 'gemma3',
      coder: 'qwen3',
      architect: 'deepseek-r1',
      reviewer: 'qwen3',
      planner: 'gpt-oss:20b',
      tester: 'gemma3',
      cheap: 'gemma3',
    },
    setupHints: [
      'Use quando você quer rodar tudo localmente via Ollama.',
      'Instale o modelo antes com "ollama pull <modelo>".',
    ],
  },
  selfhosted: {
    type: 'selfhosted',
    name: 'OpenAI-Compatible (Self-Hosted)',
    description: 'LM Studio, vLLM, gateways internos e outros endpoints compatíveis',
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:1234/v1',
    websiteUrl: 'https://lmstudio.ai/docs/app/api/endpoints/openai',
    popularModels: [
      'openai/gpt-oss-20b',
      'qwen3-32b',
      'google/gemma-3-27b-it',
      'llama-3.3-70b-instruct',
      'deepseek-r1-distill-qwen-32b',
    ],
    recommendedModels: {
      default: 'openai/gpt-oss-20b',
      subAgent: 'qwen3-32b',
      coder: 'qwen3-32b',
      architect: 'llama-3.3-70b-instruct',
      reviewer: 'qwen3-32b',
      planner: 'openai/gpt-oss-20b',
      tester: 'qwen3-32b',
      cheap: 'qwen3-32b',
    },
    setupHints: [
      'Serve para LM Studio, vLLM, gateways internos e proxies OpenAI-compatible.',
      'A API key pode ficar vazia quando o servidor local nao exigir autenticacao.',
    ],
    exampleBaseUrls: [
      'http://localhost:1234/v1',
      'http://localhost:8000/v1',
      'https://llm.internal.example.com/v1',
    ],
  },
};

export const DEFAULT_EFFORT: EffortLevel = 'balanced';

export const EFFORT_PROFILES: Record<EffortLevel, EffortProfile> = {
  fast: {
    level: 'fast',
    label: 'Fast',
    description: 'Cheap, direct answers with a tight context and tool budget.',
    modelBias: 'cheap',
    maxOutputTokens: 1600,
    maxToolCalls: 8,
    includeProjectStructure: 'minimal',
    planning: 'off',
    review: false,
    reasoningEffort: 'low',
  },
  balanced: {
    level: 'balanced',
    label: 'Balanced',
    description: 'Default workflow with enough context for normal development.',
    modelBias: 'default',
    maxOutputTokens: 4000,
    maxToolCalls: 20,
    includeProjectStructure: 'standard',
    planning: 'suggest',
    review: false,
    reasoningEffort: 'medium',
  },
  deep: {
    level: 'deep',
    label: 'Deep',
    description: 'More deliberate planning, broader context, and stronger validation.',
    modelBias: 'quality',
    maxOutputTokens: 8000,
    maxToolCalls: 45,
    includeProjectStructure: 'full',
    planning: 'prefer',
    review: true,
    reasoningEffort: 'high',
  },
  max: {
    level: 'max',
    label: 'Max',
    description: 'Highest rigor for complex changes with the largest safe budget.',
    modelBias: 'quality',
    maxOutputTokens: 12000,
    maxToolCalls: 80,
    includeProjectStructure: 'full',
    planning: 'prefer',
    review: true,
    reasoningEffort: 'high',
  },
};

export function normalizeEffortLevel(value: string | undefined | null): EffortLevel | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'fast' || normalized === 'balanced' || normalized === 'deep' || normalized === 'max') {
    return normalized;
  }
  return undefined;
}

export function getEffortProfile(level: EffortLevel | undefined | null): EffortProfile {
  return EFFORT_PROFILES[level || DEFAULT_EFFORT] || EFFORT_PROFILES[DEFAULT_EFFORT];
}

export const MODEL_PURPOSES: { value: ModelPurpose; label: string; description: string }[] = [
  { value: 'default', label: 'Padrão', description: 'Modelo principal para conversas gerais' },
  { value: 'subAgent', label: 'Sub-Agentes', description: 'Modelo para tarefas paralelas (pode ser mais barato)' },
  { value: 'coder', label: 'Coder', description: 'Modelo especializado em programação' },
  { value: 'architect', label: 'Architect', description: 'Modelo para design de sistemas e arquitetura' },
  { value: 'reviewer', label: 'Reviewer', description: 'Modelo para revisão de código' },
  { value: 'planner', label: 'Planner', description: 'Modelo para planejamento de tarefas' },
  { value: 'tester', label: 'Tester', description: 'Modelo para geração e atualização de testes' },
  { value: 'cheap', label: 'Econômico', description: 'Modelo barato para tarefas simples' },
];
