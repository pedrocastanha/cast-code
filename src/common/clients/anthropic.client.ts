import Anthropic from '@anthropic-ai/sdk';

import type { ChatOptions, LlmClient } from '../interfaces/llm-client.interface';
import type { LlmEvent, Message, ToolCallRequest } from '../types/llm.types';

export interface AnthropicClientConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  client?: Anthropic;
}

export class AnthropicClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicClientConfig) {
    this.client = config.client ?? new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
  }

  async *stream(messages: Message[], options: ChatOptions = {}): AsyncGenerator<LlmEvent> {
    const toolInputs = new Map<number, { id: string; name: string; json: string }>();
    const stream = await (this.client.messages.create as any)({
      ...this.buildRequest(messages, options),
      stream: true,
    });

    for await (const event of stream as AsyncIterable<any>) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
        yield { type: 'text_delta', delta: event.delta.text };
      }
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        toolInputs.set(Number(event.index ?? 0), {
          id: String(event.content_block.id),
          name: String(event.content_block.name),
          json: '',
        });
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
        const current = toolInputs.get(Number(event.index ?? 0));
        if (current) current.json += event.delta.partial_json ?? '';
      }
      if (event.type === 'content_block_stop') {
        const current = toolInputs.get(Number(event.index ?? 0));
        if (current) {
          yield { type: 'tool_call', toolCall: this.toToolCall(current.id, current.name, current.json) };
          toolInputs.delete(Number(event.index ?? 0));
        }
      }
      if (event.type === 'message_delta' && event.usage) {
        yield {
          type: 'usage',
          usage: {
            inputTokens: event.usage.input_tokens ?? 0,
            outputTokens: event.usage.output_tokens ?? 0,
            cachedInputTokens: event.usage.cache_read_input_tokens ?? 0,
          },
        };
      }
      if (event.type === 'message_delta' && event.delta?.stop_reason) {
        yield { type: 'stop', reason: event.delta.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn' };
      }
    }
  }

  async invoke(messages: Message[], options: ChatOptions = {}): Promise<Message> {
    const response = await (this.client.messages.create as any)(this.buildRequest(messages, options));
    const toolCalls: ToolCallRequest[] = [];
    let content = '';
    for (const block of response.content ?? []) {
      if (block.type === 'text') content += block.text ?? '';
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: String(block.id),
          name: String(block.name),
          arguments: block.input && typeof block.input === 'object' ? block.input : {},
        });
      }
    }
    return { role: 'assistant', content, ...(toolCalls.length ? { toolCalls } : {}) };
  }

  getModelName(): string {
    return this.config.model;
  }

  getProviderName(): string {
    return 'anthropic';
  }

  private buildRequest(messages: Message[], options: ChatOptions): Record<string, unknown> {
    const systemMessages = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);
    if (options.systemPrompt) {
      systemMessages.unshift(options.systemPrompt);
    }

    return {
      model: this.config.model,
      max_tokens: options.maxTokens ?? this.config.maxTokens ?? 4096,
      ...(options.temperature ?? this.config.temperature) !== undefined
        ? { temperature: options.temperature ?? this.config.temperature }
        : {},
      ...(systemMessages.length ? { system: systemMessages.join('\n\n') } : {}),
      messages: this.mapMessages(messages),
      ...(options.tools?.length && options.toolChoice !== 'none'
        ? { tools: options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })) }
        : {}),
      ...(options.toolChoice === 'required' ? { tool_choice: { type: 'any' } } : {}),
    };
  }

  private mapMessages(messages: Message[]): unknown[] {
    return messages
      .filter((message) => message.role !== 'system')
      .map((message) => {
        if (message.role === 'tool') {
          return {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }],
          };
        }
        if (message.role === 'assistant' && message.toolCalls?.length) {
          return {
            role: 'assistant',
            content: [
              ...(message.content ? [{ type: 'text', text: message.content }] : []),
              ...message.toolCalls.map((toolCall) => ({
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.name,
                input: toolCall.arguments,
              })),
            ],
          };
        }
        return {
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        };
      });
  }

  private toToolCall(id: string, name: string, json: string): ToolCallRequest {
    try {
      const parsed = JSON.parse(json || '{}');
      return { id, name, arguments: parsed && typeof parsed === 'object' ? parsed : {} };
    } catch {
      return { id, name, arguments: {} };
    }
  }
}
