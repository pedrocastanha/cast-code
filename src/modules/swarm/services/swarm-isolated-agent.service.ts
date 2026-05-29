import { Injectable } from '@nestjs/common';
import { LlmClientFactory } from '../../../common/services/llm-client.factory';
import { CastAgentEngine } from '../../core/services/cast-agent-engine.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { FilesystemToolsService } from '../../tools/services/filesystem-tools.service';
import { ShellToolsService } from '../../tools/services/shell-tools.service';
import type { SwarmWorkerRunInput } from '../types';

@Injectable()
export class SwarmIsolatedAgentService {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly llmClientFactory: LlmClientFactory,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly filesystemTools: FilesystemToolsService,
    private readonly shellTools: ShellToolsService,
  ) {}

  async runWorker(input: SwarmWorkerRunInput): Promise<string> {
    const run = this.tail.then(() => this.runWorkerUnsafe(input));
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  private async runWorkerUnsafe(input: SwarmWorkerRunInput): Promise<string> {
    this.filesystemTools.setRootDir(input.worktree.worktreePath, input.worktree.workspaceRoot);
    this.shellTools.setRootDir(input.worktree.worktreePath, input.worktree.workspaceRoot);

    const tools = this.toolsRegistry.getIsolatedTools(input.planTask.allowedTools);
    const model = this.llmClientFactory.create('default');
    const agent = new CastAgentEngine({
      client: model,
      systemPrompt: this.buildSystemPrompt(input),
      tools,
      subagents: [],
    });

    const prompt = [
      `# Swarm task: ${input.planTask.title}`,
      input.planTask.description,
      '',
      'Execute only within your approved file ownership and allowed tools.',
      'When finished, respond with a concise summary of changes, decisions, and verification.',
    ].join('\n');

    let output = '';
    for await (const event of agent.streamEvents(
      { messages: [{ role: 'user', content: prompt }] },
      { recursionLimit: 32 },
    )) {
      const item = event as any;
      if (item.event === 'on_chat_model_stream') {
        output += this.extractChunkText(item.data?.chunk?.content);
      }
      if (!output && item.event === 'on_chat_model_end') {
        output = this.extractChunkText(item.data?.output?.content);
      }
    }

    if (output && input.onOutput) {
      input.onOutput(output);
    }
    return output.trim();
  }

  private extractAgentOutput(result: unknown): string {
    const messages = (result as { messages?: unknown[] })?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return '';
    }
    const last = messages[messages.length - 1] as { content?: unknown };
    return this.extractChunkText(last.content);
  }

  private buildSystemPrompt(input: SwarmWorkerRunInput): string {
    const ownership = input.planTask.fileOwnership.map((entry) => `- ${entry.glob}`).join('\n');
    const skills = [
      ...input.planTask.injectedSkills.map((name) => `injected:${name}`),
      ...input.planTask.discoverableSkills.map((name) => `discoverable:${name}`),
    ].join(', ');

    return [
      input.planTask.worker.systemPrompt,
      '',
      '# Swarm execution contract',
      `Worktree: ${input.worktree.worktreePath}`,
      `Branch: ${input.worktree.branchName}`,
      '',
      '# File ownership',
      ownership,
      '',
      skills ? `# Skills\n${skills}` : '',
      '',
      '# Rules',
      '- Use RELATIVE paths only.',
      '- Do not modify files outside ownership.',
      '- Do not request scope expansion unless blocked.',
    ].join('\n');
  }

  private extractChunkText(chunk: unknown): string {
    if (!chunk) return '';
    if (typeof chunk === 'string') return chunk;
    if (Array.isArray(chunk)) {
      return chunk.map((part) => this.extractChunkText(part)).join('');
    }
    if (typeof chunk === 'object') {
      const value = chunk as Record<string, unknown>;
      if (typeof value.content === 'string') return value.content;
      if (Array.isArray(value.content)) {
        return value.content.map((part: any) => (typeof part === 'string' ? part : part?.text ?? '')).join('');
      }
      if (value.kwargs && typeof (value.kwargs as any).content === 'string') {
        return (value.kwargs as any).content;
      }
    }
    return '';
  }
}
