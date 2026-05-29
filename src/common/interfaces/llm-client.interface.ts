import type { CastToolDefinition } from './cast-tool.interface';
import type { LlmEvent, Message } from '../types/llm.types';

export interface ChatOptions {
  tools?: CastToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  toolChoice?: 'auto' | 'required' | 'none';
}

export interface LlmClient {
  stream(messages: Message[], options?: ChatOptions): AsyncGenerator<LlmEvent>;
  invoke(messages: Message[], options?: ChatOptions): Promise<Message>;
  getModelName(): string;
  getProviderName(): string;
}
