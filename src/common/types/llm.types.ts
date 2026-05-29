export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string; toolCalls?: ToolCallRequest[] }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string };

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens';

export type LlmEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; toolCall: ToolCallRequest }
  | { type: 'usage'; usage: LlmUsage }
  | { type: 'stop'; reason: LlmStopReason };

export function isSystemMessage(message: Message): message is Extract<Message, { role: 'system' }> {
  return message.role === 'system';
}

export function isUserMessage(message: Message): message is Extract<Message, { role: 'user' }> {
  return message.role === 'user';
}

export function isAssistantMessage(message: Message): message is Extract<Message, { role: 'assistant' }> {
  return message.role === 'assistant';
}

export function isToolMessage(message: Message): message is Extract<Message, { role: 'tool' }> {
  return message.role === 'tool';
}

export function extractText(message: Message): string {
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
