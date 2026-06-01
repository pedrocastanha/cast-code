import OpenAI from 'openai';

import type { CastToolDefinition } from '../interfaces/cast-tool.interface';
import type { ChatOptions, LlmClient } from '../interfaces/llm-client.interface';
import type { ContentPart, LlmEvent, LlmUsage, Message, ToolCallRequest } from '../types/llm.types';
import type { ProviderType } from '../../modules/config/types/config.types';

export interface OpenAICompatibleClientConfig {
  provider: ProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  client?: OpenAI;
}

interface PendingToolCall {
  id: string;
  name: string;
  argumentsText: string;
}

export class OpenAICompatibleClient implements LlmClient {
  private readonly client: OpenAI;

  constructor(public readonly config: OpenAICompatibleClientConfig) {
    this.client = config.client ?? new OpenAI({
      apiKey: config.apiKey || 'not-required',
      baseURL: config.baseURL,
      defaultHeaders: this.getDefaultHeaders(config.provider),
    });
  }

  async *stream(messages: Message[], options: ChatOptions = {}): AsyncGenerator<LlmEvent> {
    const pendingToolCalls = new Map<number, PendingToolCall>();
    const stream = await (this.client.chat.completions.create as any)({
      ...this.buildRequest(messages, options),
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream as AsyncIterable<any>) {
      if (chunk.usage) {
        yield { type: 'usage', usage: this.mapUsage(chunk.usage) };
      }

      for (const choice of chunk.choices ?? []) {
        const delta = choice.delta ?? {};
        const content = this.contentToText(delta.content);
        if (content) {
          yield { type: 'text_delta', delta: content };
        }

        for (const toolCall of delta.tool_calls ?? []) {
          const index = Number(toolCall.index ?? 0);
          const current = pendingToolCalls.get(index) ?? {
            id: String(toolCall.id ?? `call_${index}`),
            name: '',
            argumentsText: '',
          };
          current.id = String(toolCall.id ?? current.id);
          current.name += toolCall.function?.name ?? '';
          current.argumentsText += toolCall.function?.arguments ?? '';
          pendingToolCalls.set(index, current);
        }

        if (choice.finish_reason) {
          if (pendingToolCalls.size > 0) {
            for (const toolCall of Array.from(pendingToolCalls.values())) {
              yield { type: 'tool_call', toolCall: this.toToolCallRequest(toolCall) };
            }
            pendingToolCalls.clear();
          }
          yield { type: 'stop', reason: this.mapFinishReason(choice.finish_reason) };
        }
      }
    }
  }

  async invoke(messages: Message[], options: ChatOptions = {}): Promise<Message> {
    const response = await (this.client.chat.completions.create as any)(this.buildRequest(messages, options));
    const message = response.choices?.[0]?.message ?? {};
    return {
      role: 'assistant',
      content: this.contentToText(message.content),
      toolCalls: (message.tool_calls ?? []).map((toolCall: any) => this.toToolCallRequest({
        id: String(toolCall.id),
        name: String(toolCall.function?.name ?? toolCall.name ?? ''),
        argumentsText: String(toolCall.function?.arguments ?? toolCall.arguments ?? '{}'),
      })),
    };
  }

  getModelName(): string {
    return this.config.model;
  }

  getProviderName(): string {
    return this.config.provider;
  }

  private buildRequest(messages: Message[], options: ChatOptions): Record<string, unknown> {
    const tools = (options.tools ?? []).map((tool) => this.mapTool(tool));
    return {
      model: this.config.model,
      messages: this.mapMessages(messages, options.systemPrompt),
      ...(tools.length > 0 ? { tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
      ...(options.temperature ?? this.config.temperature) !== undefined
        ? { temperature: options.temperature ?? this.config.temperature }
        : {},
      ...(options.maxTokens ?? this.config.maxTokens) !== undefined
        ? { max_tokens: options.maxTokens ?? this.config.maxTokens }
        : {},
    };
  }

  private mapMessages(messages: Message[], systemPrompt?: string): unknown[] {
    const mapped = messages.map((message) => {
      switch (message.role) {
      case 'system':
        return { role: 'system', content: message.content };
      case 'user':
        return { role: 'user', content: this.mapUserContent(message.content) };
      case 'assistant':
        return {
          role: 'assistant',
          content: message.content || null,
          ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: 'function',
            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments ?? {}) },
          })) } : {}),
        };
      case 'tool':
        return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
      }
    });

    return systemPrompt ? [{ role: 'system', content: systemPrompt }, ...mapped] : mapped;
  }

  private mapUserContent(content: string | ContentPart[]): unknown {
    if (typeof content === 'string') {
      return content;
    }

    return content.map((part) => part.type === 'text'
      ? { type: 'text', text: part.text }
      : { type: 'image_url', image_url: part.image_url });
  }

  private mapTool(tool: CastToolDefinition): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private toToolCallRequest(toolCall: PendingToolCall): ToolCallRequest {
    return {
      id: toolCall.id,
      name: toolCall.name,
      arguments: this.parseToolArguments(toolCall.argumentsText),
    };
  }

  private parseToolArguments(value: string): Record<string, unknown> {
    if (!value.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private mapFinishReason(reason: string): 'end_turn' | 'tool_use' | 'max_tokens' {
    if (reason === 'tool_calls' || reason === 'function_call') {
      return 'tool_use';
    }
    if (reason === 'length') {
      return 'max_tokens';
    }
    return 'end_turn';
  }

  private mapUsage(usage: any): LlmUsage {
    return {
      inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      cachedInputTokens: usage.prompt_tokens_details?.cached_tokens
        ?? usage.input_token_details?.cached_tokens
        ?? usage.input_token_details?.cache_read
        ?? 0,
    };
  }

  private contentToText(content: unknown): string {
    if (!content) {
      return '';
    }
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((part) => this.contentToText(part)).join('');
    }
    if (typeof content === 'object') {
      const record = content as Record<string, unknown>;
      return typeof record.text === 'string' ? record.text : '';
    }
    return String(content);
  }

  private getDefaultHeaders(provider: ProviderType): Record<string, string> | undefined {
    if (provider !== 'openrouter') {
      return undefined;
    }
    return {
      'HTTP-Referer': 'https://cast.code',
      'X-Title': 'Cast Code',
    };
  }
}
