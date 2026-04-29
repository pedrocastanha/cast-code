export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'kimi'
  | 'qwen'
  | 'glm'
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

export interface CastConfig {
  version: number;
  language?: 'en' | 'pt';
  providers: ProvidersConfig;
  models: ModelsConfig;
  remote?: RemoteConfig;
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
  'deepseek',
  'openrouter',
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
    description: 'GPT-5.5, GPT-5.4, Codex e família GPT atual',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    websiteUrl: 'https://platform.openai.com',
    popularModels: [
      'gpt-5.5',
      'gpt-5.5-pro',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5-codex',
      'gpt-4.1',
      'gpt-4.1-mini',
    ],
    recommendedModels: {
      default: 'gpt-5.4-mini',
      subAgent: 'gpt-5.4-mini',
      coder: 'gpt-5.5',
      architect: 'gpt-5.5',
      reviewer: 'gpt-5.5',
      planner: 'gpt-5.4',
      tester: 'gpt-5.4-mini',
      cheap: 'gpt-4.1-mini',
    },
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Opus 4.7, Sonnet 4.6 e Haiku 4.5',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com',
    websiteUrl: 'https://console.anthropic.com',
    popularModels: [
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
    ],
    recommendedModels: {
      default: 'claude-sonnet-4-6',
      subAgent: 'claude-haiku-4-5',
      coder: 'claude-sonnet-4-6',
      architect: 'claude-opus-4-7',
      reviewer: 'claude-sonnet-4-6',
      planner: 'claude-sonnet-4-6',
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
    description: 'Kimi K2.6/K2.5 com OpenAI compatibility',
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
      default: 'kimi-k2.5',
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
      'qwen3.6-max-preview',
      'qwen3.6-plus',
      'qwen3-max-preview',
      'qwen-plus',
      'qwen-flash',
    ],
    recommendedModels: {
      default: 'qwen3.6-plus',
      subAgent: 'qwen-flash',
      coder: 'qwen3.6-max-preview',
      architect: 'qwen3.6-max-preview',
      reviewer: 'qwen3.6-plus',
      planner: 'qwen3.6-plus',
      tester: 'qwen-flash',
      cheap: 'qwen-flash',
    },
  },
  glm: {
    type: 'glm',
    name: 'GLM / BigModel',
    description: 'GLM-5 e GLM-4.5 via endpoint OpenAI-compatible da Zhipu',
    requiresApiKey: true,
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    websiteUrl: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5',
    popularModels: [
      'glm-5',
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5-flash',
    ],
    recommendedModels: {
      default: 'glm-4.5-air',
      subAgent: 'glm-4.5-flash',
      coder: 'glm-5',
      architect: 'glm-5',
      reviewer: 'glm-4.5-air',
      planner: 'glm-4.5-air',
      tester: 'glm-4.5-flash',
      cheap: 'glm-4.5-flash',
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
    description: 'Acesso a múltiplos modelos via uma API',
    requiresApiKey: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    websiteUrl: 'https://openrouter.ai',
    popularModels: [
      'openai/gpt-5',
      'anthropic/claude-sonnet-4',
      'google/gemini-2.5-pro',
      'meta-llama/llama-3.1-70b-instruct',
    ],
    recommendedModels: {
      default: 'openai/gpt-5',
      subAgent: 'google/gemini-2.5-pro',
      coder: 'openai/gpt-5',
      architect: 'anthropic/claude-sonnet-4',
      reviewer: 'anthropic/claude-sonnet-4',
      planner: 'google/gemini-2.5-pro',
      tester: 'google/gemini-2.5-pro',
      cheap: 'google/gemini-2.5-pro',
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
