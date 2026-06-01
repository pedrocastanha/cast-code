import {
  FunctionCallingMode,
  GoogleGenerativeAI,
  SchemaType,
} from '@google/generative-ai';

import type { ChatOptions, LlmClient } from '../interfaces/llm-client.interface';
import type { LlmEvent, Message, ToolCallRequest } from '../types/llm.types';

export interface GeminiClientConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  client?: GoogleGenerativeAI;
}

export class GeminiClient implements LlmClient {
  private readonly client: GoogleGenerativeAI;

  constructor(private readonly config: GeminiClientConfig) {
    this.client = config.client ?? new GoogleGenerativeAI(config.apiKey);
  }

  async *stream(messages: Message[], options: ChatOptions = {}): AsyncGenerator<LlmEvent> {
    const model = this.getGenerativeModel(options);
    const result = await (model as any).generateContentStream({ contents: this.mapMessages(messages) });
    for await (const chunk of result.stream as AsyncIterable<any>) {
      const text = typeof chunk.text === 'function' ? chunk.text() : '';
      if (text) {
        yield { type: 'text_delta', delta: text };
      }
      for (const call of chunk.functionCalls?.() ?? []) {
        yield { type: 'tool_call', toolCall: this.toToolCall(call) };
      }
      const usage = chunk.usageMetadata;
      if (usage) {
        yield {
          type: 'usage',
          usage: {
            inputTokens: usage.promptTokenCount ?? 0,
            outputTokens: usage.candidatesTokenCount ?? 0,
            cachedInputTokens: usage.cachedContentTokenCount ?? 0,
          },
        };
      }
    }
    yield { type: 'stop', reason: 'end_turn' };
  }

  async invoke(messages: Message[], options: ChatOptions = {}): Promise<Message> {
    const model = this.getGenerativeModel(options);
    const response = await (model as any).generateContent({ contents: this.mapMessages(messages) });
    const result = response.response;
    const toolCalls = (result.functionCalls?.() ?? []).map((call: any) => this.toToolCall(call));
    return {
      role: 'assistant',
      content: typeof result.text === 'function' ? result.text() : '',
      ...(toolCalls.length ? { toolCalls } : {}),
    };
  }

  getModelName(): string {
    return this.config.model;
  }

  getProviderName(): string {
    return 'gemini';
  }

  private getGenerativeModel(options: ChatOptions): unknown {
    return this.client.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        ...(options.temperature ?? this.config.temperature) !== undefined
          ? { temperature: options.temperature ?? this.config.temperature }
          : {},
        ...(options.maxTokens ?? this.config.maxTokens) !== undefined
          ? { maxOutputTokens: options.maxTokens ?? this.config.maxTokens }
          : {},
      },
      ...(options.systemPrompt ? { systemInstruction: options.systemPrompt } : {}),
      ...(options.tools?.length ? { tools: [{ functionDeclarations: options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: this.toGeminiSchema(tool.parameters),
      })) }] } : {}),
      ...(options.toolChoice ? {
        toolConfig: {
          functionCallingConfig: {
            mode: options.toolChoice === 'required'
              ? FunctionCallingMode.ANY
              : options.toolChoice === 'none'
                ? FunctionCallingMode.NONE
                : FunctionCallingMode.AUTO,
          },
        },
      } : {}),
    } as any);
  }

  private mapMessages(messages: Message[]): unknown[] {
    return messages
      .filter((message) => message.role !== 'system')
      .map((message) => {
        if (message.role === 'tool') {
          return {
            role: 'function',
            parts: [{ functionResponse: { name: message.toolName, response: { content: message.content } } }],
          };
        }
        if (message.role === 'assistant' && message.toolCalls?.length) {
          return {
            role: 'model',
            parts: message.toolCalls.map((toolCall) => ({
              functionCall: { name: toolCall.name, args: toolCall.arguments },
            })),
          };
        }
        return {
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) }],
        };
      });
  }

  private toToolCall(call: any): ToolCallRequest {
    return {
      id: String(call.id ?? call.name ?? `call_${Date.now()}`),
      name: String(call.name ?? ''),
      arguments: call.args && typeof call.args === 'object' ? call.args : {},
    };
  }

  private toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(schema), (_key, value) => {
      if (value === 'object') return SchemaType.OBJECT;
      if (value === 'string') return SchemaType.STRING;
      if (value === 'number') return SchemaType.NUMBER;
      if (value === 'integer') return SchemaType.INTEGER;
      if (value === 'boolean') return SchemaType.BOOLEAN;
      if (value === 'array') return SchemaType.ARRAY;
      return value;
    });
  }
}
