import { ProviderType } from '../types/config.types';

export interface ModelContextUsage {
  contextWindow: number;
  windowLabel: string;
  usedTokens: number;
  remainingTokens: number;
  usedPercent: number;
  remainingPercent: number;
  usedPercentLabel: string;
  remainingPercentLabel: string;
}

const EXACT_CONTEXT_WINDOWS: Partial<Record<ProviderType, Record<string, number>>> = {
  openai: {
    'gpt-4.1': 1_047_576,
    'gpt-4.1-mini': 1_047_576,
    'gpt-4.1-nano': 1_047_576,
    'gpt-5': 400_000,
    'gpt-5-codex': 400_000,
    'gpt-5.2': 400_000,
    'gpt-5.2-codex': 400_000,
    'gpt-5.3-codex': 400_000,
    'gpt-5.4': 400_000,
    'gpt-5.4-pro': 400_000,
    'gpt-5-mini': 400_000,
    'gpt-5-nano': 400_000,
  },
  anthropic: {
    'claude-sonnet-4-5': 200_000,
    'claude-sonnet-4-5-20250929': 200_000,
    'claude-haiku-4-5': 200_000,
    'claude-haiku-4-5-20251001': 200_000,
    'claude-opus-4-1': 200_000,
    'claude-opus-4-1-20250805': 200_000,
  },
  gemini: {
    'gemini-2.5-pro': 1_048_576,
    'gemini-2.5-flash': 1_048_576,
    'gemini-2.5-flash-lite': 1_048_576,
  },
  kimi: {
    'kimi-k2.6': 256_000,
    'kimi-k2.5': 256_000,
    'kimi-k2-thinking': 256_000,
    'kimi-k2-turbo-preview': 256_000,
    'kimi-k2-0905-preview': 256_000,
  },
  qwen: {
    'qwen3-235b-a22b-instruct-2507': 262_144,
    'qwen3-235b-a22b-thinking-2507': 262_144,
    'qwen-max-latest': 262_144,
    'qwen-plus-latest': 1_000_000,
    'qwen-turbo-latest': 1_000_000,
    'qwen3-coder-plus': 262_144,
  },
  glm: {
    'glm-4.6': 200_000,
    'glm-4.5': 128_000,
    'glm-4.5-air': 128_000,
    'glm-4.5-flash': 128_000,
  },
  mistral: {
    'mistral-large-latest': 256_000,
    'mistral-medium-latest': 256_000,
    'mistral-small-latest': 256_000,
    'codestral-latest': 256_000,
    'devstral-latest': 128_000,
    'magistral-medium-latest': 128_000,
    'ministral-14b-latest': 128_000,
    'ministral-8b-latest': 128_000,
  },
  xai: {
    'grok-4.3': 1_000_000,
    'grok-4.20': 2_000_000,
    'grok-4-1-fast-reasoning': 2_000_000,
    'grok-4-1-fast-non-reasoning': 2_000_000,
    'grok-code-fast-1': 256_000,
    'grok-4': 256_000,
  },
  groq: {
    'openai/gpt-oss-120b': 131_072,
    'openai/gpt-oss-20b': 131_072,
    'llama-3.3-70b-versatile': 131_072,
    'llama-3.1-8b-instant': 131_072,
    'qwen/qwen3-32b': 131_072,
    'deepseek-r1-distill-llama-70b': 131_072,
    'meta-llama/llama-4-scout-17b-16e-instruct': 131_072,
  },
  cohere: {
    'command-a-plus-05-2026': 128_000,
    'command-a-03-2025': 256_000,
    'command-a-reasoning-08-2025': 4_000,
    'command-r7b-12-2024': 128_000,
    'command-r-plus': 128_000,
    'c4ai-aya-expanse-32b': 128_000,
    'tiny-aya-global': 8_000,
  },
  perplexity: {
    sonar: 128_000,
    'sonar-pro': 200_000,
    'sonar-reasoning': 128_000,
    'sonar-reasoning-pro': 200_000,
    'sonar-deep-research': 128_000,
  },
  together: {
    'moonshotai/kimi-k2.5': 256_000,
    'deepseek-ai/deepseek-r1': 128_000,
    'meta-llama/llama-3.3-70b-instruct-turbo': 128_000,
    'qwen/qwen3-235b-a22b': 262_144,
    'qwen/qwen3-32b': 131_072,
    'google/gemma-3-27b-it': 128_000,
  },
  fireworks: {
    'accounts/fireworks/models/deepseek-v3p1': 128_000,
    'accounts/fireworks/models/kimi-k2-instruct-0905': 256_000,
    'accounts/fireworks/models/qwen3-235b-a22b': 262_144,
    'accounts/fireworks/models/llama-v3p3-70b-instruct': 128_000,
    'accounts/fireworks/models/gpt-oss-120b': 128_000,
  },
  huggingface: {
    'openai/gpt-oss-120b': 128_000,
    'deepseek-ai/deepseek-r1:fastest': 128_000,
    'qwen/qwen3-32b': 131_072,
    'google/gemma-3-27b-it': 128_000,
    'meta-llama/llama-3.3-70b-instruct': 128_000,
    'mistralai/mistral-small-3.2-24b-instruct-2506': 128_000,
  },
  cerebras: {
    'gpt-oss-120b': 131_072,
    'gpt-oss-20b': 131_072,
    'qwen-3-32b': 131_072,
    'qwen-3-235b-a22b-instruct-2507': 131_072,
    'zai-glm-4.7': 131_072,
  },
  deepseek: {
    'deepseek-v4-pro': 1_000_000,
    'deepseek-v4-flash': 1_000_000,
    'deepseek-chat': 1_000_000,
    'deepseek-reasoner': 1_000_000,
  },
  ollama: {
    'gpt-oss:20b': 128_000,
    'llama3.3': 128_000,
    qwen3: 40_000,
    gemma3: 128_000,
    'deepseek-r1': 128_000,
    mistral: 32_000,
  },
  selfhosted: {
    'openai/gpt-oss-20b': 128_000,
    'qwen3-32b': 262_144,
    'llama-3.3-70b-instruct': 128_000,
    'deepseek-r1-distill-qwen-32b': 128_000,
  },
};

function normalizeModel(model: string): string {
  return model.trim().toLowerCase();
}

function contextFromOpenRouter(model: string): number | undefined {
  if (model.startsWith('openai/')) {
    return getModelContextWindow('openai', model.replace(/^openai\//, ''));
  }
  if (model.startsWith('anthropic/')) {
    const anthropicModel = model.replace(/^anthropic\//, '').replace(/(\d)\.(\d)/g, '$1-$2');
    return getModelContextWindow('anthropic', anthropicModel);
  }
  if (model.startsWith('google/')) {
    const googleModel = model.replace(/^google\//, '');
    if (googleModel.startsWith('gemma-')) return 128_000;
    return getModelContextWindow('gemini', googleModel);
  }
  if (model.startsWith('moonshotai/')) {
    return getModelContextWindow('kimi', model.replace(/^moonshotai\//, ''));
  }
  if (model.startsWith('z-ai/')) {
    return getModelContextWindow('glm', model.replace(/^z-ai\//, ''));
  }
  if (model.startsWith('qwen/')) {
    return 262_144;
  }
  if (model.startsWith('deepseek/')) {
    return getModelContextWindow('deepseek', model.replace(/^deepseek\//, ''));
  }
  if (model.startsWith('meta-llama/') && /llama-3\.[13]/.test(model)) {
    return 128_000;
  }
  if (model.startsWith('meta-llama/llama-4')) {
    return 128_000;
  }
  return undefined;
}

function contextFromFamily(provider: ProviderType, model: string): number | undefined {
  switch (provider) {
  case 'openai':
    if (/^gpt-4\.1(?:-|$)/.test(model)) return 1_047_576;
    if (/^gpt-5\.(2|3|4)(?:[.-]|$)/.test(model)) return 400_000;
    if (/^gpt-5-(mini|nano)(?:[.-]|$)/.test(model)) return 400_000;
    if (/^gpt-5-codex(?:[.-]|$)/.test(model)) return 400_000;
    if (/^gpt-5(?:[.-]|$)/.test(model)) return 400_000;
    break;
  case 'anthropic':
    if (model.startsWith('claude-')) return 200_000;
    break;
  case 'gemini':
    if (model.startsWith('gemini-2.5-')) return 1_048_576;
    break;
  case 'kimi':
    if (model.startsWith('kimi-k2')) return 256_000;
    break;
  case 'qwen':
    if (model.includes('qwen-plus') || model.includes('qwen-turbo')) return 1_000_000;
    if (model.includes('235b') || model.includes('qwen-max') || model.includes('coder')) return 262_144;
    if (model.includes('qwen3-32b')) return 131_072;
    break;
  case 'glm':
    if (model.startsWith('glm-4.6')) return 200_000;
    if (model.startsWith('glm-4.5')) return 128_000;
    break;
  case 'mistral':
    if (model.includes('large') || model.includes('medium') || model.includes('small') || model.includes('codestral')) return 256_000;
    if (model.includes('devstral') || model.includes('magistral') || model.includes('ministral')) return 128_000;
    break;
  case 'xai':
    if (model.startsWith('grok-4.20') || model.startsWith('grok-4-1-fast')) return 2_000_000;
    if (model.startsWith('grok-4.3')) return 1_000_000;
    if (model.startsWith('grok-')) return 256_000;
    break;
  case 'groq':
    if (model.includes('gpt-oss') || model.includes('llama') || model.includes('qwen') || model.includes('deepseek')) return 131_072;
    break;
  case 'cohere':
    if (model.startsWith('command-a-03')) return 256_000;
    if (model.startsWith('command-a-plus') || model.startsWith('command-r') || model.startsWith('c4ai-aya')) return 128_000;
    if (model.startsWith('tiny-aya')) return 8_000;
    break;
  case 'perplexity':
    if (model.includes('pro')) return 200_000;
    if (model.startsWith('sonar')) return 128_000;
    break;
  case 'together':
  case 'fireworks':
  case 'huggingface':
  case 'cerebras':
    if (model.includes('235b')) return 262_144;
    if (model.includes('kimi')) return 256_000;
    if (model.includes('gemma') || model.includes('llama') || model.includes('deepseek') || model.includes('gpt-oss') || model.includes('qwen')) return 128_000;
    break;
  case 'deepseek':
    if (model.startsWith('deepseek-v4') || model === 'deepseek-chat' || model === 'deepseek-reasoner') {
      return 1_000_000;
    }
    break;
  case 'openrouter':
    return contextFromOpenRouter(model);
  case 'selfhosted':
    if (model.includes('gpt-oss')) return 128_000;
    if (model.startsWith('qwen3')) return 262_144;
    if (model.startsWith('llama-3.3') || model.startsWith('llama3.3')) return 128_000;
    if (model.startsWith('deepseek-r1')) return 128_000;
    break;
  case 'ollama':
    break;
  }

  return undefined;
}

export function getModelContextWindow(provider: ProviderType, model: string): number | undefined {
  const normalized = normalizeModel(model);
  const exact = EXACT_CONTEXT_WINDOWS[provider]?.[normalized];
  if (exact) {
    return exact;
  }

  return contextFromFamily(provider, normalized);
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${formatDecimal(Math.round((tokens / 1_000_000) * 10) / 10)}M`;
  }
  if (tokens >= 1_000) {
    return `${formatDecimal(Math.round((tokens / 1_000) * 10) / 10)}k`;
  }
  return tokens.toString();
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getModelContextUsage(
  provider: ProviderType,
  model: string,
  usedTokens: number,
): ModelContextUsage | undefined {
  const contextWindow = getModelContextWindow(provider, model);
  if (!contextWindow) {
    return undefined;
  }

  const safeUsedTokens = Math.max(0, Math.floor(usedTokens));
  const remainingTokens = Math.max(0, contextWindow - safeUsedTokens);
  const usedPercent = Math.min(100, (safeUsedTokens / contextWindow) * 100);
  const remainingPercent = Math.max(0, (remainingTokens / contextWindow) * 100);

  return {
    contextWindow,
    windowLabel: formatContextWindow(contextWindow),
    usedTokens: safeUsedTokens,
    remainingTokens,
    usedPercent,
    remainingPercent,
    usedPercentLabel: formatPercent(usedPercent),
    remainingPercentLabel: formatPercent(remainingPercent),
  };
}
