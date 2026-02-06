import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { execSync } from 'child_process';
import { createDeepAgent } from 'deepagents';
import { ConfigService } from './config.service';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { ProjectLoaderService } from '../../project/services/project-loader.service';
import { ProjectContextService } from '../../project/services/project-context.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { MemoryService } from '../../memory/services/memory.service';
import { ProjectInitResult } from '../../project/types';

@Injectable()
export class DeepAgentService implements OnModuleInit {
  private agent: any;
  private messages: BaseMessage[] = [];
  private tokenCount = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly projectLoader: ProjectLoaderService,
    private readonly projectContext: ProjectContextService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly memoryService: MemoryService,
  ) {}

  async onModuleInit() {
    await this.configService.loadGlobalConfig();
  }

  async initialize(): Promise<ProjectInitResult> {
    const projectPath = await this.projectLoader.detectProject();

    if (projectPath) {
      const projectConfig = await this.projectLoader.loadProject(projectPath);

      if (projectConfig.context) {
        this.projectContext.setContext(projectConfig.context);
      }

      if (projectConfig.mcpConfigs) {
        this.mcpRegistry.loadConfigs(projectConfig.mcpConfigs);
        await this.mcpRegistry.connectAll();
      }

      const agentsOverridePath = this.projectLoader.getAgentsOverridePath(projectPath);
      await this.agentRegistry.loadProjectAgents(agentsOverridePath);

      const skillsOverridePath = this.projectLoader.getSkillsOverridePath(projectPath);
      await this.skillRegistry.loadProjectSkills(skillsOverridePath);

      await this.memoryService.initialize(projectPath);
    }

    const provider = this.configService.getProvider();
    let model: BaseChatModel;

    if (provider === 'ollama') {
      model = new ChatOllama({
        model: this.configService.getModel(),
        temperature: this.configService.getTemperature(),
        baseUrl: this.configService.getOllamaBaseUrl(),
      });
    } else {
      model = new ChatOpenAI({
        modelName: this.configService.getModel(),
        temperature: this.configService.getTemperature(),
        openAIApiKey: this.configService.getApiKey(),
        streaming: true,
      });
    }

    const contextPrompt = this.projectContext.getContextPrompt();
    const memoryPrompt = await this.memoryService.getMemoryPrompt();
    const subagents = this.agentRegistry.getSubagentDefinitions(contextPrompt);
    const tools = this.toolsRegistry.getAllTools();
    const mcpTools = this.mcpRegistry.getAllMcpTools();
    const systemPrompt = this.buildSystemPrompt(contextPrompt, memoryPrompt, tools, mcpTools);

    this.agent = createDeepAgent({
      model,
      systemPrompt,
      tools: [...tools, ...mcpTools],
      subagents,
    });

    return {
      projectPath,
      hasContext: this.projectContext.hasContext(),
      agentCount: subagents.length,
      toolCount: tools.length + mcpTools.length,
    };
  }

  private getGitStatus(): string {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      }).trim();
      const status = execSync('git status --short 2>/dev/null', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      }).trim();
      const log = execSync('git log --oneline -5 2>/dev/null', {
        encoding: 'utf-8',
        cwd: process.cwd(),
      }).trim();

      let result = `Branch: ${branch}`;
      if (status) {
        result += `\nChanges:\n${status}`;
      } else {
        result += `\nStatus: clean`;
      }
      if (log) {
        result += `\nRecent commits:\n${log}`;
      }
      return result;
    } catch {
      return 'Not a git repository';
    }
  }

  private buildSystemPrompt(
    contextPrompt: string,
    memoryPrompt: string,
    tools: any[],
    mcpTools: any[],
  ): string {
    const gitInfo = this.getGitStatus();
    const allToolNames = [
      ...tools.map((t: any) => t.name),
      ...mcpTools.map((t: any) => t.name),
    ];

    const parts: string[] = [];

    parts.push(
      `You are Cast, an AI coding assistant running as a CLI tool.`,
      `You help developers with software engineering tasks including writing code, debugging, refactoring, and answering questions about codebases.`,
      ``,
    );

    parts.push(
      `# CRITICAL RULES`,
      ``,
      `## NEVER Guess — ALWAYS Verify`,
      `- NEVER say a file "doesn't exist" or "I can't find it" without FIRST using glob or read_file to check`,
      `- NEVER guess file contents — ALWAYS read_file before answering questions about a file`,
      `- NEVER assume a directory structure — ALWAYS use ls or glob to discover it`,
      `- NEVER say "I don't have access" — you DO have access through your tools`,
      `- If a user mentions a file path, your FIRST action must be to read it or verify it exists`,
      ``,
      `## Read Before Edit`,
      `- ALWAYS use read_file on a file before using edit_file or write_file on it`,
      `- NEVER edit a file you haven't read in this conversation`,
      `- Understand existing code before suggesting modifications`,
      ``,
      `## Minimal Changes`,
      `- Only make changes that are directly requested or clearly necessary`,
      `- Don't add features, refactor code, or make "improvements" beyond what was asked`,
      `- Don't add docstrings, comments, or type annotations to code you didn't change`,
      `- Preserve existing code style and conventions`,
      ``,
    );

    parts.push(
      `# Available Tools`,
      `You have ${allToolNames.length} tools available. USE THEM PROACTIVELY.`,
      ``,
    );

    if (tools.length > 0) {
      parts.push(`## Built-in Tools`);
      for (const t of tools) {
        parts.push(`- **${t.name}**: ${t.description}`);
      }
      parts.push(``);
    }

    if (mcpTools.length > 0) {
      parts.push(`## MCP Tools (External Services)`);
      for (const t of mcpTools) {
        parts.push(`- **${t.name}**: ${t.description}`);
      }
      parts.push(``);
    }

    parts.push(
      `# Tool Usage Guidelines`,
      ``,
      `## File Operations`,
      `- Use **read_file** to read file contents. Always read before editing.`,
      `- Use **write_file** only to create NEW files. Prefer edit_file for existing files.`,
      `- Use **edit_file** for precise string replacements in existing files.`,
      `  - Provide enough context in old_string to make it unique`,
      `  - Use replace_all=true only when renaming across the file`,
      ``,
      `## Search & Discovery`,
      `- Use **glob** to find files by pattern (e.g., "**/*.ts", "src/**/*.service.ts")`,
      `- Use **grep** to search content within files (supports regex)`,
      `  - Use context_lines to see surrounding code`,
      `  - Use output_mode="files_with_matches" to just find file paths`,
      `- Use **ls** to list directory contents`,
      `- When looking for something, try glob first, then grep if needed`,
      ``,
      `## Shell Commands`,
      `- Use **shell** for git, npm, docker, and other CLI operations`,
      `- Dangerous commands (rm -rf, sudo, git push --force) require user approval`,
      `- Use **shell_background** for long-running tasks (dev servers, watch mode)`,
      ``,
      `## Task Management`,
      `- Use **task_create** to break complex work into trackable subtasks`,
      `- Use **task_update** to mark tasks as in_progress or completed`,
      `- Use **task_list** to see all tasks and their status`,
      `- Use **ask_user_question** when you need clarification BEFORE acting`,
      `  - Better to ask than to guess wrong!`,
      `  - Use type="confirm" for yes/no, "choice" for options, "text" for open input`,
      ``,
      `## Planning`,
      `- Use **enter_plan_mode** for complex tasks that need planning before execution`,
      `- Use **exit_plan_mode** to present the plan for user approval`,
      ``,
      `## Memory`,
      `- Use **memory_write** to save important learnings and project insights`,
      `- Use **memory_read** to recall previously saved notes`,
      `- Memory persists across sessions — use it to avoid repeating mistakes`,
      ``,
    );

    parts.push(
      `# Git Safety Protocol`,
      `- NEVER update git config`,
      `- NEVER run destructive git commands (push --force, reset --hard, clean -f) without explicit user request`,
      `- NEVER skip hooks (--no-verify) unless user explicitly requests it`,
      `- When committing: stage specific files (not "git add -A"), write clear commit messages`,
      `- When creating PRs: summarize all commits, not just the latest`,
      ``,
    );

    parts.push(
      `# Response Style`,
      `- Be concise in responses but thorough in your work`,
      `- Show your work: mention which tools you're using and why`,
      `- When showing code changes, explain WHAT changed and WHY`,
      `- Use markdown formatting for readability`,
      `- Reference files with their path (e.g., "In src/main.ts:")`,
      ``,
    );

    parts.push(
      `# User Mentions`,
      `When the user's message contains <file>, <directory>, <url>, or <git> tags,`,
      `these are automatically injected file/directory contents from @ mentions.`,
      `The content inside these tags is REAL and CURRENT — trust it and use it to answer.`,
      `Do NOT re-read a file that was already provided via a mention tag unless you need a different section.`,
      ``,
    );

    parts.push(
      `# Environment`,
      `- Working directory: ${process.cwd()}`,
      `- Platform: ${process.platform}`,
      `- Node.js: ${process.version}`,
      ``,
      `# Git Status (snapshot)`,
      gitInfo,
      ``,
    );

    if (contextPrompt) {
      parts.push(contextPrompt, ``);
    }

    if (memoryPrompt) {
      parts.push(
        `# Auto Memory`,
        `These are notes from previous sessions:`,
        memoryPrompt,
        ``,
      );
    }

    return parts.join('\n');
  }

  async *chat(message: string): AsyncGenerator<string> {
    this.messages.push(new HumanMessage(message));

    const stream = this.agent.streamEvents(
      {
        messages: this.messages,
      },
      {
        version: 'v2',
      }
    );

    let fullResponse = '';

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
        const content = event.data.chunk.content;
        if (typeof content === 'string' && content) {
          yield content;
          fullResponse += content;
        }
      }

      if (event.event === 'on_tool_start') {
        const toolName = event.name;
        const input = event.data?.input;
        let detail = '';

        if (toolName === 'read_file' && input?.file_path) {
          detail = ` ${input.file_path}`;
        } else if (toolName === 'write_file' && input?.file_path) {
          detail = ` ${input.file_path}`;
        } else if (toolName === 'edit_file' && input?.file_path) {
          detail = ` ${input.file_path}`;
        } else if (toolName === 'glob' && input?.pattern) {
          detail = ` ${input.pattern}`;
        } else if (toolName === 'grep' && input?.pattern) {
          detail = ` "${input.pattern}"`;
        } else if (toolName === 'shell' && input?.command) {
          const cmd = input.command.length > 60 ? input.command.slice(0, 60) + '...' : input.command;
          detail = ` ${cmd}`;
        } else if (toolName === 'ls' && input?.directory) {
          detail = ` ${input.directory}`;
        }

        yield `\n\x1b[2m  \u23bf ${toolName}${detail}\x1b[0m\n`;
      }

      if (event.event === 'on_tool_end') {
        const output = event.data?.output;
        if (output && typeof output === 'string' && output.length > 0) {
          const lines = output.split('\n');
          const previewLines = lines.slice(0, 3);
          const preview = previewLines.map(l => `\x1b[2m    ${l.slice(0, 120)}\x1b[0m`).join('\n');
          const more = lines.length > 3 ? `\n\x1b[2m    ... (${lines.length - 3} more lines)\x1b[0m` : '';
          yield `${preview}${more}\n`;
        }
      }

      if (event.event === 'on_tool_error') {
        const error = event.data?.error;
        yield `\n\x1b[31m  \u2717 Error: ${error?.message || 'Unknown error'}\x1b[0m\n`;
      }
    }

    if (fullResponse) {
      this.messages.push(new AIMessage(fullResponse));
    }
  }

  clearHistory() {
    this.messages = [];
    this.tokenCount = 0;
  }

  getHistory(): BaseMessage[] {
    return this.messages;
  }

  getMessageCount(): number {
    return this.messages.length;
  }
}
