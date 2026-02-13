export type ProviderType = 
  | 'openai' 
  | 'anthropic' 
  | 'gemini' 
  | 'kimi' 
  | 'ollama' 
  | 'deepseek'
  | 'openrouter';

export interface BaseProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface OpenAIConfig extends BaseProviderConfig {}
export interface AnthropicConfig extends BaseProviderConfig {}
export interface GeminiConfig extends BaseProviderConfig {}
export interface KimiConfig extends BaseProviderConfig {}
export interface DeepSeekConfig extends BaseProviderConfig {}
export interface OpenRouterConfig extends BaseProviderConfig {}

export interface OllamaConfig {
  baseUrl: string;
}

export interface ProvidersConfig {
  openai?: OpenAIConfig;
  anthropic?: AnthropicConfig;
  gemini?: GeminiConfig;
  kimi?: KimiConfig;
  deepseek?: DeepSeekConfig;
  openrouter?: OpenRouterConfig;
  ollama?: OllamaConfig;
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
  | 'cheap';

export type ModelsConfig = Partial<Record<ModelPurpose, ModelConfig>>;

export interface CastConfig {
  version: number;
  providers: ProvidersConfig;
  models: ModelsConfig;
}

// Provider metadata for UI
export interface ProviderMetadata {
  type: ProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  websiteUrl: string;
  popularModels: string[];
}

export const PROVIDER_METADATA: Record<ProviderType, ProviderMetadata> = {
  openai: {
    type: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-4o, GPT-3.5 Turbo e outros',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    websiteUrl: 'https://platform.openai.com',
    popularModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus, etc.',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com',
    websiteUrl: 'https://console.anthropic.com',
    popularModels: [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
  },
  gemini: {
    type: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini Pro, Gemini Ultra via Google AI Studio',
    requiresApiKey: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    websiteUrl: 'https://ai.google.dev',
    popularModels: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
  },
  kimi: {
    type: 'kimi',
    name: 'Moonshot Kimi',
    description: 'Kimi K1, Kimi K2 - modelos chineses avançados',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    websiteUrl: 'https://platform.moonshot.cn',
    popularModels: ['kimi-k2', 'kimi-k1.5', 'kimi-moonshot-v1-128k'],
  },
  deepseek: {
    type: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek Chat, DeepSeek Coder',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    websiteUrl: 'https://platform.deepseek.com',
    popularModels: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  },
  openrouter: {
    type: 'openrouter',
    name: 'OpenRouter',
    description: 'Acesso a múltiplos modelos via uma API',
    requiresApiKey: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    websiteUrl: 'https://openrouter.ai',
    popularModels: [
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/gemini-1.5-pro',
      'meta-llama/llama-3.1-70b-instruct',
    ],
  },
  ollama: {
    type: 'ollama',
    name: 'Ollama (Local)',
    description: 'Modelos locais via Ollama - gratuito e privado',
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:11434',
    websiteUrl: 'https://ollama.com',
    popularModels: ['llama3.2', 'llama3.1', 'codellama', 'mistral', 'qwen2.5'],
  },
};

export const MODEL_PURPOSES: { value: ModelPurpose; label: string; description: string }[] = [
  { value: 'default', label: 'Padrão', description: 'Modelo principal para conversas gerais' },
  { value: 'subAgent', label: 'Sub-Agentes', description: 'Modelo para tarefas paralelas (pode ser mais barato)' },
  { value: 'coder', label: 'Coder', description: 'Modelo especializado em programação' },
  { value: 'architect', label: 'Architect', description: 'Modelo para design de sistemas e arquitetura' },
  { value: 'reviewer', label: 'Reviewer', description: 'Modelo para revisão de código' },
  { value: 'planner', label: 'Planner', description: 'Modelo para planejamento de tarefas' },
  { value: 'cheap', label: 'Econômico', description: 'Modelo barato para tarefas simples' },
];
