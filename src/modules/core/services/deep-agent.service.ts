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
      `## Planning (CRITICAL)`,
      `- Use **enter_plan_mode** BEFORE executing complex tasks (3+ files, new features, refactoring)`,
      `- In plan mode: explore the codebase thoroughly, then write a step-by-step plan`,
      `- Use **exit_plan_mode** to present the plan for user approval before executing`,
      `- ALWAYS plan before you act on complex requests. Never jump straight to editing.`,
      ``,
      `## Memory`,
      `- Use **memory_write** to save important learnings and project insights`,
      `- Use **memory_read** to recall previously saved notes`,
      `- Memory persists across sessions — use it to avoid repeating mistakes`,
      ``,
    );

    parts.push(
      `# Execution Protocol`,
      ``,
      `## When the user asks you to "understand", "explore", or "analyze" the project:`,
      `1. FIRST: ls the root directory to see the project structure`,
      `2. SECOND: Read key config files (package.json, tsconfig.json, pyproject.toml, Cargo.toml, etc.)`,
      `3. THIRD: Use glob to map the full directory tree: glob("**/*", with key patterns)`,
      `4. FOURTH: Read the most important files (entry points, main modules, README)`,
      `5. FIFTH: Present a structured summary with:`,
      `   - Project type and framework`,
      `   - Directory structure overview`,
      `   - Key modules and their purpose`,
      `   - Dependencies and patterns used`,
      `   - Architecture diagram (if applicable)`,
      `Do NOT stop after reading 1-2 files. Be EXHAUSTIVE. Read as many files as needed.`,
      ``,
      `## When the user asks you to implement something:`,
      `1. FIRST: Understand the current codebase (read relevant files)`,
      `2. SECOND: If the task touches 3+ files, use enter_plan_mode`,
      `3. THIRD: Create a task list with task_create for each step`,
      `4. FOURTH: Execute each step, marking tasks as completed`,
      `5. FIFTH: Verify your changes (re-read edited files, run tests if available)`,
      `6. SIXTH: Summarize what was done`,
      ``,
      `## Tool Chain Patterns (use these sequences):`,
      `- **Find something**: glob → grep → read_file`,
      `- **Edit a file**: read_file → edit_file → read_file (verify)`,
      `- **Explore a module**: ls → glob("module/**/*") → read_file (multiple key files)`,
      `- **Debug an issue**: grep (error message) → read_file → edit_file → shell (test)`,
      `- **New feature**: enter_plan_mode → task_create → [implement] → shell (test) → exit_plan_mode`,
      ``,
      `## Thoroughness Rules:`,
      `- NEVER give up after one failed search. Try different patterns, directories, and approaches.`,
      `- ALWAYS verify your changes by re-reading the file after editing.`,
      `- If tests exist, run them after making changes: shell("npm test") or equivalent.`,
      `- When you encounter an error, analyze it and try to fix it — don't just report it.`,
      `- If a task is complex, break it into subtasks with task_create.`,
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

  private formatToolStart(toolName: string, input: any): string {
    const dim = '\x1b[2m';
    const cyan = '\x1b[36m';
    const reset = '\x1b[0m';
    const icon = '\u23bf';

    let detail = '';

    switch (toolName) {
      case 'read_file':
        detail = input?.file_path ? ` ${input.file_path}` : '';
        break;
      case 'write_file':
        detail = input?.file_path ? ` ${input.file_path}` : '';
        break;
      case 'edit_file':
        detail = input?.file_path ? ` ${input.file_path}` : '';
        break;
      case 'glob':
        detail = input?.pattern ? ` ${input.pattern}` : '';
        if (input?.cwd) detail += ` in ${input.cwd}`;
        break;
      case 'grep':
        detail = input?.pattern ? ` "${input.pattern}"` : '';
        if (input?.file_pattern) detail += ` (${input.file_pattern})`;
        break;
      case 'shell':
        if (input?.command) {
          const cmd = input.command.length > 80 ? input.command.slice(0, 80) + '...' : input.command;
          detail = ` ${cmd}`;
        }
        break;
      case 'shell_background':
        if (input?.command) {
          const cmd = input.command.length > 60 ? input.command.slice(0, 60) + '...' : input.command;
          detail = ` ${cmd}`;
        }
        break;
      case 'ls':
        detail = ` ${input?.directory || input?.path || '.'}`;
        break;
      case 'web_search':
        detail = input?.query ? ` "${input.query}"` : '';
        break;
      case 'web_fetch':
        detail = input?.url ? ` ${input.url}` : '';
        break;
      case 'task_create':
        detail = input?.title ? ` "${input.title}"` : '';
        break;
      case 'task_update':
        detail = input?.id ? ` #${input.id} → ${input?.status || ''}` : '';
        break;
      case 'task_list':
        detail = '';
        break;
      case 'task_get':
        detail = input?.id ? ` #${input.id}` : '';
        break;
      case 'ask_user_question':
        detail = input?.question ? ` "${input.question.slice(0, 50)}${input.question.length > 50 ? '...' : ''}"` : '';
        break;
      case 'enter_plan_mode':
        detail = ' Starting plan...';
        break;
      case 'exit_plan_mode':
        detail = ' Submitting plan';
        break;
      case 'memory_write':
        detail = input?.key ? ` ${input.key}` : '';
        break;
      case 'memory_read':
        detail = input?.key ? ` ${input.key}` : '';
        break;
      case 'memory_search':
        detail = input?.query ? ` "${input.query}"` : '';
        break;
      default:
        if (input) {
          const keys = Object.keys(input);
          if (keys.length > 0) {
            const firstVal = String(input[keys[0]]).slice(0, 60);
            detail = ` ${keys[0]}=${firstVal}`;
          }
        }
    }

    return `\n${dim}  ${cyan}${icon}${reset}${dim} ${toolName}${detail}${reset}\n`;
  }

  private formatToolEnd(toolName: string, output: string): string {
    if (!output || output.length === 0) return '';

    const dim = '\x1b[2m';
    const green = '\x1b[32m';
    const reset = '\x1b[0m';

    switch (toolName) {
      case 'read_file': {
        const lineCount = output.split('\n').length;
        return `${dim}    ${green}\u2713${reset}${dim} ${lineCount} lines${reset}\n`;
      }
      case 'write_file':
        return `${dim}    ${green}\u2713${reset}${dim} ${output.slice(0, 120)}${reset}\n`;
      case 'edit_file': {
        if (output.startsWith('Error')) {
          return `${dim}    \x1b[31m${output.slice(0, 150)}${reset}\n`;
        }
        return `${dim}    ${green}\u2713${reset}${dim} ${output.slice(0, 120)}${reset}\n`;
      }
      case 'glob': {
        const lines = output.split('\n').filter(l => l.trim());
        const fileCount = lines.length;
        const preview = lines.slice(0, 5).map(l => `${dim}    ${l.slice(0, 100)}${reset}`).join('\n');
        const more = fileCount > 5 ? `\n${dim}    ... (${fileCount - 5} more)${reset}` : '';
        return `${preview}${more}\n`;
      }
      case 'grep': {
        const lines = output.split('\n').filter(l => l.trim());
        const preview = lines.slice(0, 5).map(l => `${dim}    ${l.slice(0, 120)}${reset}`).join('\n');
        const more = lines.length > 5 ? `\n${dim}    ... (${lines.length - 5} more)${reset}` : '';
        return `${preview}${more}\n`;
      }
      case 'shell':
      case 'shell_background': {
        const lines = output.split('\n');
        const preview = lines.slice(0, 8).map(l => `${dim}    ${l.slice(0, 150)}${reset}`).join('\n');
        const more = lines.length > 8 ? `\n${dim}    ... (${lines.length - 8} more lines)${reset}` : '';
        return `${preview}${more}\n`;
      }
      case 'ls': {
        const lines = output.split('\n').filter(l => l.trim());
        const preview = lines.slice(0, 10).map(l => `${dim}    ${l}${reset}`).join('\n');
        const more = lines.length > 10 ? `\n${dim}    ... (${lines.length - 10} more)${reset}` : '';
        return `${preview}${more}\n`;
      }
      default: {
        const lines = output.split('\n');
        const preview = lines.slice(0, 3).map(l => `${dim}    ${l.slice(0, 120)}${reset}`).join('\n');
        const more = lines.length > 3 ? `\n${dim}    ... (${lines.length - 3} more lines)${reset}` : '';
        return `${preview}${more}\n`;
      }
    }
  }

  async *chat(message: string): AsyncGenerator<string> {
    this.messages.push(new HumanMessage(message));

    let stream: any;
    try {
      stream = this.agent.streamEvents(
        {
          messages: this.messages,
        },
        {
          version: 'v2',
        }
      );
    } catch (error) {
      yield `\n\x1b[31m  Error starting agent: ${(error as Error).message}\x1b[0m\n`;
      return;
    }

    let fullResponse = '';
    let lastToolName = '';
    let interactionInputTokens = 0;
    let interactionOutputTokens = 0;

    try {
      for await (const event of stream) {
        if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
          const content = event.data.chunk.content;
          if (typeof content === 'string' && content) {
            yield content;
            fullResponse += content;
          }
        }

        if (event.event === 'on_llm_end') {
          const usage = event.data?.output?.llmOutput?.tokenUsage
            || event.data?.output?.llmOutput?.usage
            || event.data?.output?.usage_metadata;
          if (usage) {
            interactionInputTokens += usage.promptTokens || usage.input_tokens || 0;
            interactionOutputTokens += usage.completionTokens || usage.output_tokens || 0;
          }
        }

        if (event.event === 'on_tool_start') {
          lastToolName = event.name;
          yield this.formatToolStart(event.name, event.data?.input);
        }

        if (event.event === 'on_tool_end') {
          const output = event.data?.output;
          if (output && typeof output === 'string') {
            yield this.formatToolEnd(lastToolName, output);
          }
        }

        if (event.event === 'on_tool_error') {
          const error = event.data?.error;
          yield `\n\x1b[31m  \u2717 Error: ${error?.message || 'Unknown error'}\x1b[0m\n`;
        }
      }
    } catch (error) {
      const msg = (error as Error).message;
      if (!msg.includes('abort') && !msg.includes('cancel')) {
        yield `\n\x1b[31m  Stream error: ${msg}\x1b[0m\n`;
      }
    }

    if (fullResponse) {
      this.messages.push(new AIMessage(fullResponse));
    }

    this.tokenCount += interactionInputTokens + interactionOutputTokens;

    if (interactionInputTokens > 0 || interactionOutputTokens > 0) {
      const fmt = (n: number) => n.toLocaleString();
      yield `\n\x1b[2m  \u2500 tokens: ${fmt(interactionInputTokens)} in / ${fmt(interactionOutputTokens)} out (session: ${fmt(this.tokenCount)})\x1b[0m\n`;
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

  getTokenCount(): number {
    return this.tokenCount;
  }
}
