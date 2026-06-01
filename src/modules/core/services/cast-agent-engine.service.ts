import { randomUUID } from 'node:crypto';

import type { CastTool } from '../../../common/interfaces/cast-tool.interface';
import { toolToDefinition } from '../../../common/interfaces/cast-tool.interface';
import type { ChatOptions, LlmClient } from '../../../common/interfaces/llm-client.interface';
import type { Message, ToolCallRequest } from '../../../common/types/llm.types';

export interface CastAgentEngineOptions {
  client: LlmClient;
  systemPrompt: string;
  tools: CastTool[];
  subagents?: Array<{ name: string; description?: string; systemPrompt?: string; tools?: CastTool[] }>;
  toolFilter?: (history: Message[], tools: CastTool[]) => CastTool[];
  toolChoice?: 'auto' | 'required' | 'none';
}

export class CastAgentEngine {
  constructor(private readonly options: CastAgentEngineOptions) {}

  async *streamEvents(payload: { messages?: unknown[] }, config: { recursionLimit?: number } = {}): AsyncGenerator<unknown> {
    const history = this.normalizeMessages(payload.messages ?? []);
    const limit = Math.max(1, config.recursionLimit ?? 40);
    let usage = { input: 0, output: 0, cachedInput: 0 };

    for (let round = 0; round < limit; round += 1) {
      const activeTools = this.options.toolFilter
        ? this.options.toolFilter(history, this.options.tools)
        : this.options.tools;
      const toolDefinitions = activeTools.map((tool) => toolToDefinition(tool));
      const toolCalls: ToolCallRequest[] = [];
      let assistantContent = '';
      let stopReason: string | undefined;

      const chatOptions: ChatOptions = {
        systemPrompt: this.options.systemPrompt,
        tools: toolDefinitions,
        toolChoice: activeTools.length > 0 ? this.options.toolChoice : 'none',
      };

      for await (const event of this.options.client.stream(history, chatOptions)) {
        if (event.type === 'text_delta') {
          assistantContent += event.delta;
          yield { event: 'on_chat_model_stream', data: { chunk: { content: event.delta } } };
        } else if (event.type === 'tool_call') {
          toolCalls.push(event.toolCall);
        } else if (event.type === 'usage') {
          usage = {
            input: event.usage.inputTokens,
            output: event.usage.outputTokens,
            cachedInput: event.usage.cachedInputTokens,
          };
        } else if (event.type === 'stop') {
          stopReason = event.reason;
        }
      }

      yield {
        event: 'on_chat_model_end',
        data: {
          output: {
            content: assistantContent,
            usage_metadata: {
              input_tokens: usage.input,
              output_tokens: usage.output,
              input_token_details: { cache_read: usage.cachedInput },
            },
            tool_calls: this.toProviderToolCalls(toolCalls),
          },
        },
      };

      if (toolCalls.length === 0 || (stopReason && stopReason !== 'tool_use')) {
        return;
      }

      history.push({ role: 'assistant', content: assistantContent, toolCalls });

      for (const toolCall of toolCalls) {
        const tool = activeTools.find((candidate) => candidate.name === toolCall.name);
        if (!tool) {
          const error = new Error(`Unknown tool: ${toolCall.name}`);
          yield {
            event: 'on_tool_error',
            name: toolCall.name,
            run_id: toolCall.id,
            data: { error },
          };
          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: error.message,
          });
          continue;
        }

        yield {
          event: 'on_tool_start',
          name: tool.name,
          run_id: toolCall.id,
          data: { input: toolCall.arguments },
        };

        try {
          const output = await tool.execute(toolCall.arguments);
          yield {
            event: 'on_tool_end',
            name: tool.name,
            run_id: toolCall.id,
            data: { output },
          };
          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            toolName: tool.name,
            content: output,
          });
        } catch (error) {
          yield {
            event: 'on_tool_error',
            name: tool.name,
            run_id: toolCall.id,
            data: { error },
          };
          history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            toolName: tool.name,
            content: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  async invoke(payload: { messages?: unknown[] }, config: { recursionLimit?: number } = {}): Promise<{ messages: Message[] }> {
    const messages = this.normalizeMessages(payload.messages ?? []);
    for await (const _event of this.streamEvents({ messages }, config)) {
      void _event;
    }
    return { messages };
  }

  private normalizeMessages(messages: unknown[]): Message[] {
    return messages.map((message) => {
      const candidate = message as any;
      if (candidate?.role === 'system' || candidate?.role === 'user' || candidate?.role === 'assistant' || candidate?.role === 'tool') {
        return candidate as Message;
      }

      const type = candidate?._getType?.();
      const content = typeof candidate?.content === 'string'
        ? candidate.content
        : JSON.stringify(candidate?.content ?? '');
      if (type === 'human') return { role: 'user', content };
      if (type === 'ai') return { role: 'assistant', content };
      if (type === 'tool') {
        return {
          role: 'tool',
          toolCallId: String(candidate.tool_call_id ?? candidate.toolCallId ?? candidate.id ?? randomUUID()),
          toolName: String(candidate.name ?? candidate.toolName ?? 'tool'),
          content,
        };
      }
      return { role: 'system', content };
    });
  }

  private toProviderToolCalls(toolCalls: ToolCallRequest[]): unknown[] {
    return toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: 'function',
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.arguments ?? {}),
      },
    }));
  }
}
