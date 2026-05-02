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
    'gpt-5.4': 1_000_000,
    'gpt-5.4-mini': 400_000,
    'gpt-5.4-nano': 400_000,
    'gpt-5.5': 1_000_000,
    'gpt-5.5-pro': 1_000_000,
  },
  anthropic: {
    'claude-opus-4-7': 200_000,
    'claude-sonnet-4-6': 200_000,
    'claude-haiku-4-5': 200_000,
    'claude-haiku-4-5-20251001': 200_000,
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
    'qwen3.6-max-preview': 262_144,
    'qwen3.6-plus': 1_000_000,
    'qwen3.6-flash': 1_000_000,
    'qwen3-max': 262_144,
    'qwen3-max-preview': 81_920,
    'qwen-plus': 1_000_000,
    'qwen-flash': 1_000_000,
  },
  glm: {
    'glm-5': 200_000,
    'glm-4.5': 128_000,
    'glm-4.5-air': 128_000,
    'glm-4.5-flash': 128_000,
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
    return getModelContextWindow('anthropic', model.replace(/^anthropic\//, ''));
  }
  if (model.startsWith('google/')) {
    return getModelContextWindow('gemini', model.replace(/^google\//, ''));
  }
  if (model.startsWith('meta-llama/') && /llama-3\.[13]/.test(model)) {
    return 128_000;
  }
  return undefined;
}

function contextFromFamily(provider: ProviderType, model: string): number | undefined {
  switch (provider) {
  case 'openai':
    if (/^gpt-4\.1(?:-|$)/.test(model)) return 1_047_576;
    if (/^gpt-5\.5(?:[.-]|$)/.test(model)) return 1_000_000;
    if (model === 'gpt-5.4' || /^gpt-5\.4-\d{4}/.test(model)) return 1_000_000;
    if (/^gpt-5\.4-(mini|nano)(?:[.-]|$)/.test(model)) return 400_000;
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
    if (model.includes('3.6-plus') || model.includes('3.6-flash')) return 1_000_000;
    if (model.includes('3.6-max')) return 262_144;
    if (model.includes('qwen3-max-preview')) return 81_920;
    if (model.includes('qwen3-max')) return 262_144;
    if (model.includes('qwen-plus') || model.includes('qwen-flash')) return 1_000_000;
    break;
  case 'glm':
    if (model.startsWith('glm-5')) return 200_000;
    if (model.startsWith('glm-4.5')) return 128_000;
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
