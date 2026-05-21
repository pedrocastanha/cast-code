import { Injectable } from '@nestjs/common';
import { HumanMessage } from '@langchain/core/messages';
import {
  createDeepAgent,
  FilesystemBackend,
  type BackendProtocolV2,
  type EditResult,
  type FileInfo,
  type GlobResult,
  type GrepMatch,
  type GrepResult,
  type LsResult,
  type ReadRawResult,
  type ReadResult,
  type WriteResult,
} from 'deepagents';
import * as path from 'node:path';
import { MultiLlmService } from '../../../common/services/multi-llm.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { FilesystemToolsService } from '../../tools/services/filesystem-tools.service';
import { ShellToolsService } from '../../tools/services/shell-tools.service';
import type { SwarmWorkerRunInput } from '../types';

class SwarmWorktreeBackend implements BackendProtocolV2 {
  private readonly backend: FilesystemBackend;

  constructor(
    private readonly worktreePath: string,
    private readonly workspaceRoot: string,
  ) {
    this.backend = new FilesystemBackend({ rootDir: path.resolve(this.workspaceRoot) });
  }

  private resolvePath(key: string): string {
    const root = path.resolve(this.worktreePath);
    const workspace = path.resolve(this.workspaceRoot);
    const resolved = path.isAbsolute(key) ? path.resolve(key) : path.resolve(root, key);
    if (resolved === workspace || resolved.startsWith(workspace + path.sep) || resolved.startsWith(root + path.sep)) {
      return resolved;
    }
    throw new Error(`Path ${resolved} outside swarm worktree ${root}`);
  }

  async ls(dirPath: string): Promise<LsResult> {
    try {
      return await this.backend.ls(this.resolvePath(dirPath));
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async lsInfo(dirPath: string): Promise<FileInfo[]> {
    const result = await this.ls(dirPath);
    return result.files ?? [];
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<ReadResult> {
    try {
      return await this.backend.read(this.resolvePath(filePath), offset, limit);
    } catch (error) {
      return { error: `Error reading file '${filePath}': ${(error as Error).message}` };
    }
  }

  async readRaw(filePath: string): Promise<ReadRawResult> {
    try {
      return await this.backend.readRaw(this.resolvePath(filePath));
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    try {
      return await this.backend.write(this.resolvePath(filePath), content);
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    try {
      return await this.backend.edit(this.resolvePath(filePath), oldString, newString, replaceAll);
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async grep(pattern: string, dirPath?: string | null, glob?: string | null): Promise<GrepResult> {
    try {
      return await this.backend.grep(pattern, this.resolvePath(dirPath || '.'), glob);
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async grepRaw(pattern: string, dirPath?: string, glob?: string | null): Promise<GrepMatch[] | string> {
    const result = await this.grep(pattern, dirPath, glob);
    return result.error ? `Error: ${result.error}` : result.matches ?? [];
  }

  async glob(pattern: string, searchPath?: string): Promise<GlobResult> {
    try {
      return await this.backend.glob(pattern, this.resolvePath(searchPath || '.'));
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async globInfo(pattern: string, searchPath?: string): Promise<FileInfo[]> {
    const result = await this.glob(pattern, searchPath);
    return result.files ?? [];
  }
}

@Injectable()
export class SwarmIsolatedAgentService {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly multiLlm: MultiLlmService,
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
    const model = this.multiLlm.createStreamingModel('default');
    const backend = new SwarmWorktreeBackend(input.worktree.worktreePath, input.worktree.workspaceRoot);
    // @ts-expect-error deepagents graph types exceed the TS recursion limit in this build.
    const agent: { invoke: (input: unknown, config?: unknown) => Promise<unknown> } = createDeepAgent({
      model,
      systemPrompt: this.buildSystemPrompt(input),
      tools,
      subagents: [],
      backend: () => backend as any,
    });

    const prompt = [
      `# Swarm task: ${input.planTask.title}`,
      input.planTask.description,
      '',
      'Execute only within your approved file ownership and allowed tools.',
      'When finished, respond with a concise summary of changes, decisions, and verification.',
    ].join('\n');

    const result = await agent.invoke(
      { messages: [new HumanMessage(prompt)] },
      { recursionLimit: 32 },
    );

    const output = this.extractAgentOutput(result);
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
