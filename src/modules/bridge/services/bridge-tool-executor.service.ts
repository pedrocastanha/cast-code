import { Injectable, Optional } from '@nestjs/common';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import type {
  BridgeToolCall,
  BridgeToolDefinition,
  BridgeToolManifest,
  BridgeToolResult,
} from '../types/bridge.types';

const MAX_TOOL_RESULT_CHARS = 32_000;

interface BridgeExecutableTool {
  name: string;
  description?: string;
  invoke(input: Record<string, unknown>): Promise<unknown>;
}

@Injectable()
export class BridgeToolExecutorService {
  constructor(@Optional() private readonly toolsRegistry?: ToolsRegistryService) {}

  getManifest(): BridgeToolManifest {
    const tools: BridgeToolDefinition[] = this.getAllowedTools().map((tool) => ({
      name: tool.name,
      description: tool.description || `${tool.name} tool`,
      inputSchema: this.inputSchemaFor(tool.name),
    }));

    return { tools };
  }

  async execute(call: BridgeToolCall): Promise<BridgeToolResult> {
    const tool = this.getAllowedTools().find((candidate) => candidate.name === call.name);
    if (!tool) {
      return {
        id: call.id,
        name: call.name,
        status: 'error',
        error: `Unknown bridge tool: ${call.name}`,
      };
    }

    try {
      const input = this.normalizeArguments(call.name, call.arguments);
      const output = await tool.invoke(input);
      return {
        id: call.id,
        name: call.name,
        status: 'ok',
        content: this.truncate(this.stringifyOutput(output)),
      };
    } catch (error) {
      return {
        id: call.id,
        name: call.name,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getAllowedTools(): BridgeExecutableTool[] {
    const tools = this.toolsRegistry?.getAllTools?.() ?? [];
    const allowed = new Set([
      'read_file',
      'write_file',
      'edit_file',
      'ls',
      'glob',
      'grep',
      'shell',
      'shell_background',
      'shell_background_output',
      'shell_background_kill',
      'memory_read',
      'memory_search',
      'memory_write',
      'rag_search',
      'list_commands',
      'cast_command',
      'list_skills',
      'read_skill',
      'list_skill_files',
      'skill_view',
      'task_create',
      'task_update',
      'task_list',
      'task_get',
      'ask_user_question',
    ]);

    return tools.filter((tool) => allowed.has(tool.name));
  }

  private normalizeArguments(name: string, args: Record<string, unknown>): Record<string, unknown> {
    if (name === 'read_file' && typeof args.path === 'string' && !args.file_path) {
      return { ...args, file_path: args.path };
    }

    if ((name === 'write_file' || name === 'edit_file') && typeof args.path === 'string' && !args.file_path) {
      return { ...args, file_path: args.path };
    }

    if (name === 'ls' && typeof args.path === 'string' && !args.directory) {
      return { ...args, directory: args.path };
    }

    if ((name === 'memory_read' || name === 'memory_search') && typeof args.query === 'string' && !args.pattern) {
      return { ...args, pattern: args.query };
    }

    return args;
  }

  private inputSchemaFor(name: string): Record<string, unknown> {
    if (name === 'read_file') {
      return {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number' },
          limit: { type: 'number' },
        },
        required: ['path'],
      };
    }

    if (name === 'write_file') {
      return {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      };
    }

    if (name === 'edit_file') {
      return {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['path', 'old_string', 'new_string'],
      };
    }

    if (name === 'ls') {
      return {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
      };
    }

    if (name === 'shell') {
      return {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          timeout: { type: 'number' },
          description: { type: 'string' },
        },
        required: ['command'],
      };
    }

    if (name === 'cast_command') {
      return {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      };
    }

    return { type: 'object', additionalProperties: true };
  }

  private stringifyOutput(output: unknown): string {
    if (typeof output === 'string') {
      return output;
    }

    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }

  private truncate(value: string): string {
    if (value.length <= MAX_TOOL_RESULT_CHARS) {
      return value;
    }

    return `${value.slice(0, MAX_TOOL_RESULT_CHARS)}\n... [truncated ${value.length - MAX_TOOL_RESULT_CHARS} chars]`;
  }
}
