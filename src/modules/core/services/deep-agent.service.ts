import { Injectable } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { execSync } from 'child_process';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { MultiLlmService } from '../../../common/services/multi-llm.service';
import { MarkdownRendererService } from '../../../common/services/markdown-renderer.service';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { ProjectLoaderService } from '../../project/services/project-loader.service';
import { ProjectContextService } from '../../project/services/project-context.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { MemoryService } from '../../memory/services/memory.service';
import { ProjectInitResult } from '../../project/types';
import { Task } from '../../tasks/types/task.types';
import { McpServerSummary } from '../../mcp/types';

const SUMMARIZE_THRESHOLD = 40;
const KEEP_RECENT = 10;
const RECURSION_LIMIT = 100;
const DEEPAGENT_BUILTIN_TOOLS = new Set([
  'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'ls',
  'write_todos', 'task',
]);

@Injectable()
export class DeepAgentService {
  private agent: any;
  private model: BaseChatModel | null = null;
  private messages: BaseMessage[] = [];
  private tokenCount = 0;
  private lastToolOutputs: { tool: string; output: string }[] = [];

  private cachedSystemPrompt: string = '';
  private cachedExtraTools: any[] = [];
  private cachedMcpTools: any[] = [];
  private cachedMcpDiscoveryTools: any[] = [];
  private cachedSubagents: any[] = [];

  constructor(
    private readonly multiLlmService: MultiLlmService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly projectLoader: ProjectLoaderService,
    private readonly projectContext: ProjectContextService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly memoryService: MemoryService,
    private readonly markdownRenderer: MarkdownRendererService,
  ) {}

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
      const legacyAgentsOverridePath = this.projectLoader.getLegacyAgentsOverridePath(projectPath);
      await this.agentRegistry.loadProjectAgents(agentsOverridePath);
      await this.agentRegistry.loadProjectAgents(legacyAgentsOverridePath);

      const skillsOverridePath = this.projectLoader.getSkillsOverridePath(projectPath);
      const legacySkillsOverridePath = this.projectLoader.getLegacySkillsOverridePath(projectPath);
      await this.skillRegistry.loadProjectSkills(skillsOverridePath);
      await this.skillRegistry.loadProjectSkills(legacySkillsOverridePath);

      await this.memoryService.initialize(projectPath);
    }

    this.model = this.multiLlmService.createStreamingModel('default');

    const contextPrompt = this.projectContext.getContextPrompt();
    const memoryPrompt = await this.memoryService.getMemoryPrompt();

    const subagents = this.agentRegistry.getSubagentDefinitions(contextPrompt);
    const allTools = this.toolsRegistry.getAllTools();
    const mcpTools = this.mcpRegistry.getAllMcpTools();

    const extraTools = allTools.filter(t => !DEEPAGENT_BUILTIN_TOOLS.has(t.name));
    const mcpDiscoveryTools = this.mcpRegistry.getDiscoveryTools();
    const mcpServerSummaries = this.mcpRegistry.getServerSummaries();

    const systemPrompt = this.buildSystemPrompt(contextPrompt, memoryPrompt, subagents, allTools, mcpTools, mcpServerSummaries);

    this.cachedSystemPrompt = systemPrompt;
    this.cachedExtraTools = extraTools;
    this.cachedMcpTools = mcpTools;
    this.cachedMcpDiscoveryTools = mcpDiscoveryTools;
    this.cachedSubagents = subagents;

    this.agent = createDeepAgent({
      model: this.model,
      systemPrompt,
      tools: [...extraTools, ...mcpTools, ...mcpDiscoveryTools],
      subagents,
      backend: () => new FilesystemBackend({ rootDir: process.cwd() }),
    });

    return {
      projectPath,
      hasContext: this.projectContext.hasContext(),
      agentCount: subagents.length,
      toolCount: extraTools.length + mcpTools.length,
    };
  }

  async reinitializeModel(): Promise<void> {
    this.model = this.multiLlmService.createStreamingModel('default');
    this.agent = createDeepAgent({
      model: this.model,
      systemPrompt: this.cachedSystemPrompt,
      tools: [...this.cachedExtraTools, ...this.cachedMcpTools, ...this.cachedMcpDiscoveryTools],
      subagents: this.cachedSubagents,
      backend: () => new FilesystemBackend({ rootDir: process.cwd() }),
    });
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
    subagents: any[],
    tools: any[],
    mcpTools: any[],
    mcpServerSummaries: McpServerSummary[] = [],
  ): string {
    const gitInfo = this.getGitStatus();
    const allToolNames = [
      ...tools.map((t: any) => t.name),
      ...mcpTools.map((t: any) => t.name),
    ];

    const parts: string[] = [];

    parts.push(
      `You are Cast, an autonomous AI coding assistant running as a CLI tool.`,
      `You are a highly capable agent that can independently explore codebases, make decisions, execute multi-step plans, and delegate work to specialized sub-agents. You help developers with software engineering tasks including writing code, debugging, refactoring, and answering questions about codebases.`,
      ``,
    );

    parts.push(
      `# CRITICAL RULES`,
      ``,
      `## NEVER Guess — ALWAYS Verify`,
      `- NEVER say a file "doesn't exist" without FIRST using glob or read_file to check`,
      `- NEVER guess file contents — ALWAYS read_file before answering about a file`,
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

    const builtInCount = tools.length;
    const mcpCount = mcpTools.length;
    const discoveryCount = 2;

    parts.push(
      `# Available Tools`,
      ``,
      `You have ${allToolNames.length} tools available:`,
      `- **Built-in**: ${builtInCount} tools (read_file, write_file, edit_file, glob, grep, ls, shell, task management, memory)`,
    );

    if (mcpCount > 0) {
      const serverCount = mcpServerSummaries.length;
      parts.push(`- **MCP**: ${mcpCount} tools from ${serverCount} server(s)`);
    }

    if (mcpCount > 0) {
      parts.push(`- **Discovery**: ${discoveryCount} tools (mcp_list_servers, mcp_list_tools)`);
    }

    parts.push(
      ``,
      `USE THEM PROACTIVELY.`,
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
      parts.push(``);
      parts.push(`**⚠️ Important**: Only tools from servers with status "connected" are available. Tools from disconnected servers will fail.`);
      parts.push(``);

      if (mcpServerSummaries.length > 0) {
        for (const server of mcpServerSummaries) {
          const statusIcon = server.status === 'connected' ? '✓' : '✗';
          parts.push(`### ${statusIcon} ${server.name} (${server.transport}, ${server.status}) — ${server.toolCount} tools`);
          for (const td of server.toolDescriptions) {
            parts.push(`- **${td.name}**: ${td.description}`);
          }
        }
      } else {
        for (const t of mcpTools) {
          parts.push(`- **${t.name}**: ${t.description}`);
        }
      }
      parts.push(`## MCP Discovery Tools`);
      parts.push(`- **mcp_list_servers**: List all connected MCP servers with status and tool counts`);
      parts.push(`- **mcp_list_tools**: List tools from a specific server or all servers`);
      parts.push(``);
    }

    parts.push(
      `# Task Management & Kanban Board`,
      `You are integrated with a live Kanban Board. The board is the source of truth for the user to see your progress.`,
      `- **CRITICAL**: Whenever you start working on a task, you MUST call **task_update** with status="in_progress".`,
      `- **CRITICAL**: When a task is finished, you MUST call **task_update** with status="completed".`,
      `- Use **task_create** to break complex work into trackable subtasks. They will appear on the board instantly.`,
      `- Use **task_list** to see what's on your plate.`,
      `- Use **ask_user_question** when you need clarification BEFORE acting.`,
      ``,
      `## Memory`,
      `- Use **memory_write** to save important learnings and project insights`,
      `- Use **memory_read** to recall previously saved notes`,
      `- Memory persists across sessions — use it to avoid repeating mistakes`,
      ``,
    );

    if (mcpTools.length > 0) {
      parts.push(
        `# MCP Integration Protocol`,
        ``,
        `MCP (Model Context Protocol) tools connect you to external services. They work exactly like built-in tools but reach outside the local filesystem.`,
        ``,
        `## Connected Servers`,
      );
      if (mcpServerSummaries.length > 0) {
        for (const s of mcpServerSummaries) {
          parts.push(`- **${s.name}** (${s.transport}, ${s.status}) — ${s.toolCount} tools`);
        }
      }
      parts.push(
        ``,
        `## When to Use MCP vs Built-in`,
        `| Need | Use |`,
        `|------|-----|`,
        `| Read/write local files | Built-in (read_file, write_file, edit_file) |`,
        `| Search local codebase | Built-in (glob, grep) |`,
        `| Run commands | Built-in (shell) |`,
        `| Interact with external APIs/services | MCP tools |`,
        `| Discover available MCP capabilities | mcp_list_servers, mcp_list_tools |`,
        ``,
        `## MCP Tool Naming Convention`,
        `MCP tools follow the pattern \`{server}_{tool}\` (e.g., \`figma_get_file\`, \`github_create_issue\`).`,
        `The prefix tells you which server provides the tool.`,
        ``,
        `## Discovery`,
        `- Use **mcp_list_servers** to see which servers are connected and their status`,
        `- Use **mcp_list_tools** to explore what tools a server provides (with descriptions)`,
        `- When you're unsure which MCP tool to use, call mcp_list_tools first`,
        ``,
        `## Error Handling`,
        `- If an MCP tool returns an error, check the server status with mcp_list_servers`,
        `- MCP servers can disconnect — if a tool fails, the server may need reconnection`,
        `- Report MCP errors to the user and suggest they check /mcp list in the REPL`,
        ``,
      );
    }

    parts.push(
      `# Planning Protocol`,
      ``,
      `## When to Enter Plan Mode`,
      `Use **enter_plan_mode** when:`,
      `- Task touches 3+ files`,
      `- Task involves new features or architecture changes`,
      `- Task is ambiguous and needs scope definition`,
      `- User explicitly asks for a plan`,
      ``,
      `Do NOT plan for: simple fixes, single-file edits, questions, explanations`,
      ``,
      `## Plan Mode Workflow`,
      `1. **enter_plan_mode** — signals you are planning`,
      `2. **Explore rapidly**: Use glob and grep efficiently to understand codebase`,
      `3. **Design**: Create structured plan with specific file changes and order`,
      `4. **exit_plan_mode** — present plan for approval`,
      `5. **Execute immediately** after approval without asking for further confirmation`,
      ``,
      `## Critical: Autonomous Execution`,
      `AFTER the user approves your plan, you MUST:`,
      `- Start implementing immediately`,
      `- Create tasks and execute them sequentially`,
      `- Do NOT ask "should I proceed?" or "ready to start?"`,
      `- Do NOT wait for additional confirmation`,
      `- Just execute the approved plan autonomously`,
      ``,
      `## Plan Quality Rules`,
      `- Specify WHAT changes and WHY for each file`,
      `- Order by dependency (foundations first)`,
      `- Include verification at the end`,
      `- Use ask_user_question ONLY to clarify requirements, not to ask for permission to execute`,
      ``,
    );

    if (subagents.length > 0) {
      parts.push(
        `# Sub-Agent Orchestration`,
        ``,
        `You have ${subagents.length} specialized sub-agents available. Each has domain-specific knowledge and tools.`,
        ``,
        `## Available Sub-Agents`,
      );
      for (const sa of subagents) {
        const mcpAnnotation = sa.mcp && sa.mcp.length > 0 ? ` [MCP: ${sa.mcp.join(', ')}]` : '';
        parts.push(`- **${sa.name}**: ${sa.description}${mcpAnnotation}`);
      }
      parts.push(
        ``,
        `## When to Delegate to Sub-Agents`,
        `- Task requires specialized domain knowledge (React, testing, API design, databases)`,
        `- Multiple independent subtasks can be worked on in parallel`,
        `- Task is well-defined and self-contained (a sub-agent can complete it without further guidance)`,
        `- You want a focused review or analysis (e.g., code review, architecture review)`,
        ``,
        `## When NOT to Delegate`,
        `- Simple tasks you can do yourself quickly`,
        `- Tasks that require back-and-forth with the user`,
        `- Tasks that depend heavily on earlier context in this conversation`,
        ``,
        `## Delegation Pattern`,
        `1. Identify the task and which sub-agent is best suited`,
        `2. Create a clear, specific task description with all necessary context`,
        `3. Delegate execution to that sub-agent (do not stop at planning only)`,
        `4. Track delegated work with task_create/task_update`,
        `5. When the sub-agent returns, verify the result and integrate it`,
        `6. Mark the task as completed`,
        ``,
        `## Delegation Quality Bar`,
        `- If user explicitly asks to use a specific sub-agent, you MUST delegate to it`,
        `- For frontend UI generation from Figma, prefer the frontend sub-agent when available`,
        `- Avoid fake delegation: creating tasks without executing delegated work is not enough`,
        `- Return concrete delegated outputs (files changed, decisions made, validations run)`,
        ``,
        `## Multi-Agent Coordination`,
        `For large tasks, you can orchestrate multiple sub-agents:`,
        `1. Break the work into independent pieces`,
        `2. Assign each piece to the most qualified sub-agent`,
        `3. Track progress with task_create/task_update`,
        `4. Integrate results and verify the combined output`,
        ``,
        `## MCP-Aware Delegation`,
        `When a task involves heavy interaction with an external service (e.g., fetching Figma designs, managing GitHub issues):`,
        `- Check which sub-agents have MCP access (annotated with [MCP: name] above)`,
        `- Delegate MCP-heavy work to the sub-agent with the right MCP connection`,
        `- If no sub-agent has the needed MCP, handle it yourself using the MCP tools directly`,
        `- Include the MCP server name in the task description so the sub-agent knows which tools to use`,
        ``,
      );
    }

    parts.push(
      `# Execution Protocol`,
      ``,
      `## Exploring a Project`,
      `1. ls the project root with \`ls .\` — NEVER use \`ls /\` (that is the system root, not the project)`,
      `2. Read key config files (package.json, tsconfig.json, etc.)`,
      `3. glob to map directory tree with key patterns`,
      `4. Read the most important files (entry points, main modules)`,
      `5. Present a structured summary`,
      `Be EXHAUSTIVE. Read as many files as needed.`,
      ``,
      `## Implementing Changes`,
      `1. Understand the current codebase (read relevant files)`,
      `2. If complex (3+ files): use enter_plan_mode`,
      `3. Create a task list with task_create for each step`,
      `4. Execute each step, marking tasks as completed`,
      `5. Verify changes (re-read edited files, run tests)`,
      `6. Summarize what was done`,
      ``,
      `## Tool Chain Patterns`,
      `- **Find something**: glob → grep → read_file`,
      `- **Edit a file**: read_file → edit_file → read_file (verify)`,
      `- **Explore a module**: ls → glob("module/**/*") → read_file (key files)`,
      `- **Debug an issue**: grep (error) → read_file → edit_file → shell (test)`,
      `- **New feature**: enter_plan_mode → task_create → [implement] → shell (test)`,
      ``,
      `## Thoroughness Rules`,
      `- NEVER give up after one failed search. Try different patterns and approaches.`,
      `- ALWAYS verify changes by re-reading the file after editing.`,
      `- If tests exist, run them after changes: shell("npm test") or equivalent.`,
      `- When you encounter an error, analyze and fix it — don't just report it.`,
      `- If blocked, try a different approach. If still blocked, ask the user.`,
      ``,
    );

    parts.push(
      `# Autonomous Decision-Making`,
      ``,
      `You are an autonomous agent. Make decisions proactively:`,
      ``,
      `## Decision Framework`,
      `| Situation | Action |`,
      `|-----------|--------|`,
      `| User asks to implement something | Explore first, then plan if complex |`,
      `| You find a bug while working | Fix it AND mention it to the user |`,
      `| Test fails after your change | Analyze the failure and fix it |`,
      `| Build fails | Read the error, fix the cause |`,
      `| File you need doesn't exist | Search broader, check for alternatives |`,
      `| Task is ambiguous | ask_user_question BEFORE starting |`,
      `| Task has multiple approaches | Briefly explain options, pick the best one |`,
      `| Something could break | Use enter_plan_mode and verify |`,
      ``,
      `## Self-Correction`,
      `- After editing, always re-read the file to verify the change is correct`,
      `- If a tool call fails, understand why and adjust (don't retry the same thing)`,
      `- If your approach isn't working after 3 attempts, step back and reconsider`,
      `- Save important learnings with memory_write so you don't repeat mistakes`,
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

    const skillSummaries = this.skillRegistry.getSkillSummaries();
    if (skillSummaries.length > 0) {

      parts.push(
        `# Domain Knowledge`,
        ``,
        `You have ${skillSummaries.length} skills loaded:`,
      );

      for (const skill of skillSummaries) {
        parts.push(`- **${skill.name}**: ${skill.description}`);
      }
      parts.push(``);
    }

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

    const filePath = (i: any): string => {
      if (!i) return '';
      if (typeof i === 'string') return i;
      const v = i.file_path || i.path || i.filename || i.file || i.filepath;
      if (v) return String(v);
      // Fallback: find any key whose name suggests a file path
      for (const key of Object.keys(i)) {
        if (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) {
          return String(i[key]);
        }
      }
      return '';
    };

    switch (toolName) {
      case 'read_file':
        detail = filePath(input) ? ` ${filePath(input)}` : '';
        break;
      case 'write_file':
        detail = filePath(input) ? ` ${filePath(input)}` : '';
        break;
      case 'edit_file':
        detail = filePath(input) ? ` ${filePath(input)}` : '';
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
      case 'mcp_list_servers':
        detail = ' Listing MCP servers';
        break;
      case 'mcp_list_tools':
        detail = input?.server ? ` server=${input.server}` : ' (all servers)';
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

  private async autoSummarize(force = false): Promise<boolean> {
    if ((!force && this.messages.length < SUMMARIZE_THRESHOLD) || !this.model) {
      return false;
    }

    if (this.messages.length < 4) {
      return false;
    }

    const oldMessages = this.messages.slice(0, this.messages.length - KEEP_RECENT);
    const recentMessages = this.messages.slice(this.messages.length - KEEP_RECENT);

    const conversationText = oldMessages.map((m) => {
      const role = m._getType() === 'human' ? 'User' : 'Assistant';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
      return `${role}: ${truncated}`;
    }).join('\n');

    try {
      const summaryResponse = await this.model.invoke([
        new SystemMessage(
          `You are a conversation summarizer. Produce a concise summary of the following conversation between a user and an AI assistant. Focus on:
- Key decisions made
- Files that were read or modified
- Tasks completed or pending
- Important context the assistant needs to remember
Keep the summary under 500 words. Output ONLY the summary, no preamble.`
        ),
        new HumanMessage(conversationText),
      ]);

      const summaryText = typeof summaryResponse.content === 'string'
        ? summaryResponse.content
        : JSON.stringify(summaryResponse.content);

      this.messages = [
        new SystemMessage(`[Conversation Summary — ${oldMessages.length} messages compacted]\n\n${summaryText}`),
        ...recentMessages,
      ];

      return true;
    } catch {
      return false;
    }
  }

  async *chat(message: string): AsyncGenerator<string> {
    const summarized = await this.autoSummarize();
    if (summarized) {
      yield `\n\x1b[2m  \u2500 conversation compacted (${this.messages.length} messages retained)\x1b[0m\n`;
    }

    this.messages.push(new HumanMessage(message));
    this.lastToolOutputs = [];

    let stream: any;
    try {
      stream = this.agent.streamEvents(
        { messages: this.messages },
        { version: 'v2', recursionLimit: RECURSION_LIMIT },
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
          const text = this.extractTextFromModelContent(event.data.chunk.content);
          if (text) {
            yield text;
            fullResponse += text;
          }
        }

        if (event.event === 'on_chat_model_end') {
          const output = event.data?.output;
          if (!fullResponse && output?.content) {
            const fallbackText = this.extractTextFromModelContent(output.content);
            if (fallbackText) {
              yield fallbackText;
              fullResponse += fallbackText;
            }
          }
          const usage = output?.usage_metadata
            || output?.response_metadata?.usage;
          if (usage) {
            interactionInputTokens += usage.input_tokens || usage.prompt_tokens || usage.promptTokens || 0;
            interactionOutputTokens += usage.output_tokens || usage.completion_tokens || usage.completionTokens || 0;
          }
        }

        if (event.event === 'on_tool_start') {
          lastToolName = event.name;
          yield this.formatToolStart(event.name, event.data?.input);
        }

        if (event.event === 'on_tool_end') {
          const raw = event.data?.output;
          let output = '';
          if (typeof raw === 'string') {
            output = raw;
          } else if (raw?.content) {
            output = typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content);
          } else if (raw?.output) {
            output = typeof raw.output === 'string' ? raw.output : JSON.stringify(raw.output);
          } else if (raw) {
            output = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
          }
          if (output) {
            this.lastToolOutputs.push({ tool: lastToolName, output });
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

    const fmt = (n: number) => n.toLocaleString();
    yield `\n\x1b[2m  \u2500 tokens: ${fmt(interactionInputTokens)} in / ${fmt(interactionOutputTokens)} out (session: ${fmt(this.tokenCount)})\x1b[0m\n`;
  }

  clearHistory() {
    this.messages = [];
    this.tokenCount = 0;
  }

  private extractTextFromModelContent(content: unknown): string {
    if (!content) return '';

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      let combined = '';
      for (const item of content) {
        combined += this.extractTextFromModelContent(item);
      }
      return combined;
    }

    if (typeof content === 'object') {
      const record = content as Record<string, unknown>;

      if (typeof record.text === 'string') {
        return record.text;
      }

      if (typeof record.content === 'string') {
        return record.content;
      }

      if (record.content) {
        return this.extractTextFromModelContent(record.content);
      }

      if (record.delta) {
        return this.extractTextFromModelContent(record.delta);
      }
    }

    return '';
  }

  async compactHistory(): Promise<{ compacted: boolean; messagesBefore: number; messagesAfter: number }> {
    const before = this.messages.length;
    if (before < 4) {
      return { compacted: false, messagesBefore: before, messagesAfter: before };
    }
    const result = await this.autoSummarize(true);
    return { compacted: result, messagesBefore: before, messagesAfter: this.messages.length };
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

  getLastToolOutputs(): { tool: string; output: string }[] {
    return this.lastToolOutputs;
  }

  async executeTask(task: Task): Promise<{ success: boolean; error?: string }> {
    try {
      const message = [
        'Voce esta executando uma tarefa de um plano ja aprovado.',
        'NAO use enter_plan_mode nem exit_plan_mode nesta tarefa.',
        `Tarefa:\n**${task.subject}**\n\n${task.description}`,
        'Implemente diretamente o que foi pedido e valide o resultado.',
      ].join('\n\n');

      let fullResponse = '';
      for await (const chunk of this.chat(message)) {
        fullResponse += chunk;
        process.stdout.write(chunk);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}
