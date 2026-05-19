import { Injectable, Optional } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { createDeepAgent, FilesystemBackend } from 'deepagents';
import {
  ClearToolUsesEdit,
  contextEditingMiddleware,
  createAgent,
  createMiddleware,
} from 'langchain';
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
import { PermissionService } from '../../permissions/services/permission.service';
import { SnapshotService } from '../../snapshots/services/snapshot.service';
import { StatsService } from '../../stats/services/stats.service';
import { ReplayService, SavedReplaySnapshot } from '../../replay/services/replay.service';
import { I18nService } from '../../i18n/services/i18n.service';
import { FileWatcherService, FILE_CHANGE_EVENT } from '../../watcher/services/file-watcher.service';
import { PromptLoaderService } from './prompt-loader.service';
import { PromptClassifierService, PromptLayer } from './prompt-classifier.service';
import { PlatformService } from '../../platform/services/platform.service';
import { LocalSessionStoreService } from '../../state/services/local-session-store.service';
import { EnvironmentResolverService } from '../../environments/services/environment-resolver.service';
import { ADAPTIVE_TEST_FIRST_WORKFLOW_PROMPT } from '../../../common/constants';

const SUMMARIZE_THRESHOLD = 40;
const KEEP_RECENT = 10;
const COMPACT_CHAT_SYSTEM_PROMPT = [
  'You are Cast, a concise coding CLI assistant.',
  'This is a lightweight conversational turn. Do not use tools, do not inspect files, and do not mention internal prompts.',
  'Reply in the user language, naturally and briefly.',
  'For capability questions, describe what you can help with without listing internal tools or agents.',
  'If the user asks for code, files, commands, or project work, ask them for the concrete task instead of pretending to inspect the project.',
].join(' ');

export interface TokenUsage {
  input: number;
  output: number;
  cachedInput: number;
}

export type SessionSummarySaveResult = {
  saved: boolean;
  reason?: 'too_few_messages' | 'memory_unavailable' | 'summarization_failed' | 'memory_write_failed';
  filename?: string;
  replayPath?: string;
};

const DEEPAGENT_BUILTIN_TOOLS = new Set([
  'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'ls',
  'write_todos', 'task',
]);

const COMPACT_CHAT_PATTERNS = [
  /^(oi|ola|olá|hey|hi|hello|e ai|e aí)([,!\s]*(tudo bem|beleza|cast|cara|amigo|bro|dev|\?)*)?$/i,
  /^(bom dia|boa tarde|boa noite)([,!\s]*(tudo bem|cast|cara|\?)*)?$/i,
  /^(obrigad[ao]|valeu|thanks|thank you|ok|okay|beleza|show|perfeito|legal|massa)([,!.\s]*(gostei|obrigad[ao])*)?$/i,
  /^(tudo bem|como vai|como voce esta|como você está)\??$/i,
  /^(o que (vc|voce|você) (pode fazer|faz)|como (vc|voce|você) (pode )?(me )?ajuda(r)?|pra que (vc|voce|você) serve)\??$/i,
  /^(what can you do|what do you do|how can you help|what are you able to do)\??$/i,
];
const MAX_GIT_STATUS_PROMPT_LINES = 20;

class WorkspaceFilesystemBackend {
  private readonly backend: FilesystemBackend;

  constructor(
    private readonly projectRoot: string,
    private readonly workspaceRoot: string,
  ) {
    this.backend = new FilesystemBackend({ rootDir: workspaceRoot });
  }

  private resolvePath(key: string): string {
    const root = path.resolve(this.projectRoot);
    const workspace = path.resolve(this.workspaceRoot);
    const resolved = path.isAbsolute(key)
      ? path.resolve(key)
      : path.resolve(root, key);

    if (resolved === workspace || resolved.startsWith(workspace + path.sep)) {
      return resolved;
    }

    throw new Error(`Path ${resolved} outside workspace root ${workspace}`);
  }

  async lsInfo(dirPath: string) {
    return this.backend.lsInfo(this.resolvePath(dirPath));
  }

  async read(filePath: string, offset?: number, limit?: number) {
    try {
      return await this.backend.read(this.resolvePath(filePath), offset, limit);
    } catch (error) {
      return `Error reading file '${filePath}': ${(error as Error).message}`;
    }
  }

  async readRaw(filePath: string) {
    return this.backend.readRaw(this.resolvePath(filePath));
  }

  async write(filePath: string, content: string) {
    try {
      return await this.backend.write(this.resolvePath(filePath), content);
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean) {
    try {
      return await this.backend.edit(this.resolvePath(filePath), oldString, newString, replaceAll);
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async grepRaw(pattern: string, dirPath?: string, glob?: string | null) {
    try {
      return await this.backend.grepRaw(pattern, this.resolvePath(dirPath || '.'), glob);
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }

  async globInfo(pattern: string, searchPath?: string) {
    try {
      return await this.backend.globInfo(pattern, this.resolvePath(searchPath || '.'));
    } catch {
      return [];
    }
  }

  async uploadFiles(files: Array<[string, Uint8Array]>) {
    const resolved: Array<[string, Uint8Array]> = [];
    const responses: Array<{ path: string; error: 'permission_denied' | null }> = [];
    for (const [filePath, content] of files) {
      try {
        resolved.push([this.resolvePath(filePath), content]);
        responses.push({ path: filePath, error: null });
      } catch {
        responses.push({ path: filePath, error: 'permission_denied' });
      }
    }
    const uploaded = resolved.length ? await this.backend.uploadFiles(resolved) : [];
    let uploadedIndex = 0;
    return responses.map((response) => response.error ? response : uploaded[uploadedIndex++]);
  }

  async downloadFiles(paths: string[]) {
    const resolved: string[] = [];
    const responses: Array<{ path: string; content: Uint8Array | null; error: 'permission_denied' | null }> = [];
    for (const filePath of paths) {
      try {
        resolved.push(this.resolvePath(filePath));
        responses.push({ path: filePath, content: null, error: null });
      } catch {
        responses.push({ path: filePath, content: null, error: 'permission_denied' });
      }
    }
    const downloaded = resolved.length ? await this.backend.downloadFiles(resolved) : [];
    let downloadedIndex = 0;
    return responses.map((response) => response.error ? response : downloaded[downloadedIndex++]);
  }
}

@Injectable()
export class DeepAgentService {
  private agent: any;
  private leanAgent: any;
  private model: BaseChatModel | null = null;
  private messages: BaseMessage[] = [];
  private tokenCount = 0;
  private cumulativeInputTokens = 0;
  private cumulativeOutputTokens = 0;
  private cumulativeCachedInputTokens = 0;
  private lastToolOutputs: { tool: string; output: string }[] = [];

  private cachedSystemPrompt: string = '';
  private cachedLeanSystemPrompt: string = '';
  private cachedBasePrompt: string = '';
  private cachedExtraTools: any[] = [];
  private cachedLeanTools: any[] = [];
  private cachedMcpTools: any[] = [];
  private cachedMcpDiscoveryTools: any[] = [];
  private cachedSubagents: any[] = [];
  private cachedAgentToolKey = '';
  private cachedAgentSubagentKey = '';
  private pendingContextRefresh = false;
  private projectRoot: string = process.cwd();
  private workspaceRoot: string = process.cwd();
  private cachedProjectStructure: string = '';
  private cachedEnvironmentPrompt: string = '';
  private localSessionId: string | null = null;

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
    private readonly permissionService: PermissionService,
    private readonly snapshotService: SnapshotService,
    private readonly statsService: StatsService,
    private readonly replayService: ReplayService,
    private readonly i18nService: I18nService,
    private readonly fileWatcherService: FileWatcherService,
    private readonly promptLoader: PromptLoaderService,
    private readonly promptClassifier: PromptClassifierService,
    private readonly platformService: PlatformService,
    @Optional()
    private readonly localSessionStore?: LocalSessionStoreService,
    @Optional()
    private readonly environmentResolver?: EnvironmentResolverService,
  ) {
    this.fileWatcherService.on(FILE_CHANGE_EVENT, (_files: string[]) => {
      this.pendingContextRefresh = true;
    });

    this.i18nService.onLanguageChange(() => {
      this.promptLoader.invalidateCache();
      if (this.cachedExtraTools.length > 0 || this.cachedSubagents.length > 0) {
        this.cachedBasePrompt = this.buildBasePrompt(this.cachedExtraTools, this.cachedSubagents);
        this.cachedSystemPrompt = '';
      }
    });
  }

  setLocalSessionId(sessionId: string | null): void {
    this.localSessionId = sessionId;
  }

  addSessionContext(title: string, content: string): void {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    const safeContent = this.redactSensitiveText(this.truncateText(trimmed, 12_000));
    this.messages.push(new SystemMessage([
      `Resumed local session context: ${title}`,
      '',
      safeContent,
    ].join('\n')));
  }

  async initialize(): Promise<ProjectInitResult> {
    const projectPath = await this.projectLoader.detectProject();
    this.projectRoot = projectPath ?? process.cwd();
    this.workspaceRoot = await this.projectLoader.detectWorkspaceRoot(this.projectRoot);
    this.toolsRegistry.setRootDir(this.projectRoot, this.workspaceRoot);

    if (projectPath) {
      const projectConfig = await this.projectLoader.loadProject(projectPath);

      if (projectConfig.context) {
        this.projectContext.setContext(projectConfig.context);
      }

      if (projectConfig.mcpConfigs) {
        this.mcpRegistry.loadConfigs(projectConfig.mcpConfigs);
        await this.mcpRegistry.connectAll();
      }

      await this.platformService.bootstrap(this.projectRoot);
      await this.mcpRegistry.connectAll();

      const agentsOverridePath = this.projectLoader.getAgentsOverridePath(projectPath);
      const legacyAgentsOverridePath = this.projectLoader.getLegacyAgentsOverridePath(projectPath);
      await this.agentRegistry.loadProjectAgents(agentsOverridePath);
      await this.agentRegistry.loadProjectAgents(legacyAgentsOverridePath);

      const skillsOverridePath = this.projectLoader.getSkillsOverridePath(projectPath);
      const legacySkillsOverridePath = this.projectLoader.getLegacySkillsOverridePath(projectPath);
      await this.skillRegistry.loadProjectSkills(skillsOverridePath);
      await this.skillRegistry.loadProjectSkills(legacySkillsOverridePath);

      await this.memoryService.initialize(projectPath);
      await this.memoryService.getMemoryPrompt();
    }

    await this.refreshEnvironmentPrompt();

    this.model = this.multiLlmService.createStreamingModel('default');
    this.statsService.setUsageListener((event) => {
      this.platformService.track('tokens.consumed', event);
    });

    const modelConfig = (() => {
      try { return (this.multiLlmService as any).configManager?.getModelConfig('default'); } catch { return null; }
    })();
    if (modelConfig?.model) {
      this.replayService.setModel(`${modelConfig.provider}/${modelConfig.model}`);
    }

    const contextPrompt = this.projectContext.getContextPrompt();
    this.cachedProjectStructure = await this.projectContext.getProjectStructureSummary(this.projectRoot);
    const subagentContext = `Working directory: ${this.projectRoot}\n\n${contextPrompt}`.trim();
    const subagents = this.agentRegistry.getSubagentDefinitions(subagentContext);
    const allTools = this.toolsRegistry.getAllTools();
    const mcpTools = this.mcpRegistry.getAllMcpTools();

    const extraTools = allTools.filter(t => !DEEPAGENT_BUILTIN_TOOLS.has(t.name));
    const leanTools = this.selectLeanTools(allTools);
    const mcpDiscoveryTools = this.mcpRegistry.getDiscoveryTools();
    this.cachedBasePrompt = this.buildBasePrompt(allTools, subagents);
    const systemPrompt = this.cachedBasePrompt;

    this.cachedSystemPrompt = systemPrompt;
    this.cachedExtraTools = extraTools;
    this.cachedLeanTools = leanTools;
    this.cachedMcpTools = mcpTools;
    this.cachedMcpDiscoveryTools = mcpDiscoveryTools;
    this.cachedSubagents = subagents;
    const initialTools = this.selectContextTools([]);
    const initialSubagents = this.selectContextSubagents('', []);
    this.cachedAgentToolKey = this.getToolKey(initialTools);
    this.cachedAgentSubagentKey = this.getSubagentKey(initialSubagents);

    this.agent = createDeepAgent({
      model: this.model,
      systemPrompt,
      tools: initialTools,
      subagents: initialSubagents,
      backend: () => this.createFilesystemBackend(),
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
    await this.refreshEnvironmentPrompt();
    this.cachedBasePrompt = this.buildBasePrompt(this.cachedExtraTools, this.cachedSubagents);
    this.cachedSystemPrompt = this.cachedBasePrompt;
    this.cachedLeanSystemPrompt = '';
    this.leanAgent = null;
    const initialTools = this.selectContextTools([]);
    const initialSubagents = this.selectContextSubagents('', []);
    this.cachedAgentToolKey = this.getToolKey(initialTools);
    this.cachedAgentSubagentKey = this.getSubagentKey(initialSubagents);
    this.agent = createDeepAgent({
      model: this.model,
      systemPrompt: this.cachedSystemPrompt,
      tools: initialTools,
      subagents: initialSubagents,
      backend: () => this.createFilesystemBackend(),
    });
  }

  async refreshEnvironmentContext(): Promise<void> {
    await this.refreshEnvironmentPrompt();

    const allTools = this.toolsRegistry.getAllTools();
    const mcpTools = this.mcpRegistry.getAllMcpTools();
    this.cachedExtraTools = allTools.filter(t => !DEEPAGENT_BUILTIN_TOOLS.has(t.name));
    this.cachedLeanTools = this.selectLeanTools(allTools);
    this.cachedMcpTools = mcpTools;
    this.cachedMcpDiscoveryTools = this.mcpRegistry.getDiscoveryTools();
    this.cachedBasePrompt = this.buildBasePrompt(allTools, this.cachedSubagents);
    this.cachedSystemPrompt = this.cachedBasePrompt;
    this.cachedLeanSystemPrompt = '';
    this.leanAgent = null;

    const initialTools = this.selectContextTools([]);
    const initialSubagents = this.selectContextSubagents('', []);
    this.cachedAgentToolKey = this.getToolKey(initialTools);
    this.cachedAgentSubagentKey = this.getSubagentKey(initialSubagents);
    this.model = this.model ?? this.multiLlmService.createStreamingModel('default');
    this.agent = createDeepAgent({
      model: this.model,
      systemPrompt: this.cachedSystemPrompt,
      tools: initialTools,
      subagents: initialSubagents,
      backend: () => this.createFilesystemBackend(),
    });
  }

  private createFilesystemBackend(): WorkspaceFilesystemBackend {
    return new WorkspaceFilesystemBackend(this.projectRoot, this.workspaceRoot);
  }

  async getActiveEnvironmentId(): Promise<string | null> {
    const active = await this.environmentResolver?.getActive(this.projectRoot);
    return active?.id ?? null;
  }

  private selectLeanTools(tools: any[]): any[] {
    const allowed = new Set(['read_file', 'write_file', 'edit_file', 'shell']);
    return tools.filter((tool: any) => allowed.has(tool.name));
  }

  private selectContextTools(layers: PromptLayer[]): any[] {
    const selected = [...this.cachedExtraTools, ...this.cachedMcpDiscoveryTools];
    if (layers.includes('mcp')) {
      selected.push(...this.cachedMcpTools);
    }

    const seen = new Set<string>();
    return selected.filter((tool: any) => {
      if (!tool?.name || seen.has(tool.name)) return false;
      seen.add(tool.name);
      return true;
    });
  }

  private selectContextSubagents(message: string, layers: PromptLayer[]): any[] {
    if (this.cachedSubagents.length === 0) return [];
    if (layers.includes('planning')) return this.cachedSubagents;
    if (/\b(sub-?agent|agent|deleg|paralel|parallel|review|revis|frontend|backend|arquitet|architect|tester|testes?|devops|ui|ux)\b/i.test(message)) {
      return this.cachedSubagents;
    }
    return [];
  }

  private getToolKey(tools: any[]): string {
    return tools.map((tool: any) => tool.name).sort().join('|');
  }

  private getSubagentKey(subagents: any[]): string {
    return subagents.map((agent: any) => agent.name).sort().join('|');
  }

  private getGitStatus(): string {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
        encoding: 'utf-8',
        cwd: this.projectRoot,
      }).trim();
      const status = execSync('git status --short 2>/dev/null', {
        encoding: 'utf-8',
        cwd: this.projectRoot,
      }).trim();
      const log = execSync('git log --oneline -5 2>/dev/null', {
        encoding: 'utf-8',
        cwd: this.projectRoot,
      }).trim();

      let result = `Branch: ${branch}`;
      if (status) {
        const lines = status.split('\n').filter(Boolean);
        const visible = lines.slice(0, MAX_GIT_STATUS_PROMPT_LINES);
        result += `\nChanges (${lines.length} files):\n${visible.join('\n')}`;
        if (lines.length > visible.length) {
          result += `\n... ${lines.length - visible.length} more changed files omitted`;
        }
      } else {
        result += '\nStatus: clean';
      }
      if (log) {
        result += `\nRecent commits:\n${log}`;
      }
      return result;
    } catch {
      return 'Not a git repository';
    }
  }

  private buildBasePrompt(tools: any[], subagents: any[]): string {
    const langInstruction = this.i18nService.getAgentLanguageInstruction();

    let base = this.promptLoader.getPrompt('base');
    base = base.replace('{{tool_names}}', this.buildToolCapabilitySummary(tools));
    base = base.replace('{{language_instruction}}', langInstruction);

    if (subagents.length > 0) {
      base = base.replace(
        '{{subagents_section}}',
        [
          '## Sub-Agents',
          `${subagents.length} specialized sub-agents are available.`,
          'Use `list_agents` to inspect names, roles, and dispatch guidance before delegating.',
          'Delegate with the `task` tool only after choosing the right focused sub-agent.',
        ].join('\n'),
      );
    } else {
      base = base.replace('{{subagents_section}}', '');
    }

    const gitStatus = this.getGitStatus();
    if (gitStatus) base += `\n\n## Current Git Status\n\`\`\`\n${gitStatus}\n\`\`\``;

    const ragInstruction = this.platformService.getRagInstruction();
    if (ragInstruction) {
      base += `\n\n## Platform Memory/RAG\n${ragInstruction}\n\nUse \`rag_search\` to retrieve indexed platform context before answering questions that depend on project documentation, decisions, runbooks, or knowledge not present in the local files.`;
    }

    if (this.cachedEnvironmentPrompt) {
      base += `\n\n${this.cachedEnvironmentPrompt}`;
    }

    return base;
  }

  private buildToolCapabilitySummary(tools: any[]): string {
    const names = new Set(tools.map((t: any) => t.name));
    const lines: string[] = [];

    if (['read_file', 'write_file', 'edit_file'].some((name) => names.has(name))) {
      lines.push('- Files: read, write, and edit project files with relative paths.');
    }
    if (['glob', 'grep', 'ls'].some((name) => names.has(name))) {
      lines.push('- Search: inspect the project tree with ls/glob/grep before reading files.');
    }
    if (names.has('shell')) {
      lines.push('- Commands: run project commands through shell with permission checks.');
    }
    if (['task_create', 'task_update', 'task_list'].some((name) => names.has(name))) {
      lines.push('- Tasks: track multi-step work on the Cast task board.');
    }
    if (['memory_read', 'memory_write', 'memory_search', 'rag_search'].some((name) => names.has(name))) {
      lines.push('- Memory/RAG: retrieve or save project knowledge when needed.');
    }
    if (['list_skills', 'read_skill'].some((name) => names.has(name))) {
      lines.push('- Skills: call list_skills, then read_skill(name), before specialized work.');
    }
    if (['list_skill_files', 'skill_view'].some((name) => names.has(name))) {
      lines.push('- Skill support files: use list_skill_files(skillName) and skill_view(skillName, filePath) when a loaded skill mentions references, templates, scripts, or assets.');
    }
    if (names.has('list_agents')) {
      lines.push('- Agents: call list_agents before choosing a sub-agent to delegate with task.');
    }
    if (['list_commands', 'cast_command'].some((name) => names.has(name))) {
      lines.push('- Cast commands: use list_commands and cast_command for slash commands; never run slash commands through shell.');
    }
    if (['mcp_list_servers', 'mcp_list_tools'].some((name) => names.has(name))) {
      lines.push('- MCP: discover connected external-service tools with mcp_list_servers and mcp_list_tools.');
    }

    return lines.length > 0
      ? lines.join('\n')
      : '- Tools are available through the model tool interface. Use discovery tools when unsure.';
  }

  private getPromptLayers(message: string, hasMentions: boolean): PromptLayer[] {
    return this.promptClassifier.classify(message, {
      hasMcpConnected: this.cachedMcpTools.length > 0,
      hasProjectContext: this.projectContext.hasContext(),
      hasMemory: this.memoryService.isInitialized(),
      mentionsInMessage: hasMentions,
    });
  }

  private buildContextualPrompt(message: string, hasMentions: boolean, promptLayers?: PromptLayer[]): string {
    const layers = promptLayers ?? this.getPromptLayers(message, hasMentions);

    const parts = [this.cachedBasePrompt];

    for (const layer of layers) {
      const content = this.promptLoader.getPrompt(layer);
      if (content) {
        if (layer === 'mcp') {
          const serverList = this.mcpRegistry.getServerSummaries()
            .map((s: McpServerSummary) => `- **${s.name}** (${s.status}) — ${s.toolCount} tools`)
            .join('\n');
          parts.push(content.replace('{{mcp_servers}}', serverList));
        } else {
          parts.push(content);
        }
      }
    }

    parts.push(
      '## Environment',
      `- Working directory: ${this.projectRoot}`,
      `- Workspace root: ${this.workspaceRoot}`,
      `- Platform: ${process.platform}`,
      '',
      `**IMPORTANT:** Always use RELATIVE paths for all file operations (e.g. \`src/index.ts\` or \`../web/package.json\`, NOT \`/src/index.ts\` or \`${this.projectRoot}/src/index.ts\`).`,
      'All relative paths are resolved from the working directory above. Sibling folders under the workspace root are available through ../folder paths.',
    );

    if (this.cachedProjectStructure) {
      parts.push(
        '## Project Structure',
        'Project structure is not preloaded to keep input small.',
        'Use ls/glob/grep to inspect only the relevant paths before reading files.',
      );
    }

    if (this.projectContext.hasContext()) {
      parts.push(`## Project Context\n${this.projectContext.getContextPrompt()}`);
    }

    if (this.memoryService.isInitialized()) {
      const mem = this.memoryService.getCachedMemoryPrompt();
      if (mem) parts.push(`## Memory\n${mem}`);
    }

    const ragInstruction = this.platformService.getRagInstruction();
    if (ragInstruction) {
      parts.push(`## Platform Memory/RAG\n${ragInstruction}\n\nUse \`rag_search\` to retrieve indexed platform context before answering questions that depend on project documentation, decisions, runbooks, or knowledge not present in the local files.`);
    }

    return parts.join('\n\n');
  }

  private buildLeanSystemPrompt(): string {
    const parts: string[] = [];
    const langInstruction = this.i18nService.getAgentLanguageInstruction();
    if (langInstruction && !/^Always respond in English\.?$/i.test(langInstruction.trim())) {
      parts.push(langInstruction, '');
    }

    parts.push(
      'You are Cast, an autonomous AI coding assistant running in lean mode for clear single-file work.',
      'Use tools immediately, keep context small, and do not delegate to sub-agents for this task.',
      'Reply in the same language as the user request unless the user explicitly asks otherwise.',
      '',
      '# Rules',
      '- Use RELATIVE paths only.',
      '- Read the target file before editing it.',
      '- Make only the requested change.',
      '- Re-read edited files after writing.',
      '- Do not ask for confirmation to run tests when the user already requested verification.',
      '- Use read_file, not shell, to inspect file contents.',
      '- After writing a test, run it before editing production code.',
      '- If the shell tool is available, use it to run the project test command from the working directory.',
      '- Continue until the red test and final green verification have both run, unless a real blocker prevents progress.',
      '- After a green test run, report what changed and do not ask whether to implement requested work.',
      '',
      ADAPTIVE_TEST_FIRST_WORKFLOW_PROMPT,
      '',
      '# Verification',
      '- Run the smallest relevant test command first when adding or changing behavior.',
      '- After implementation, rerun the focused test and broader verification according to risk.',
      '',
      '# Environment',
      `- Working directory: ${this.projectRoot}`,
      `- Workspace root: ${this.workspaceRoot}`,
      `- Platform: ${process.platform}`,
    );

    const packageHints = this.getLeanPackageHints();
    if (packageHints) {
      parts.push('', '# Local Test Hints', packageHints);
    }

    if (this.projectContext.hasContext()) {
      parts.push('', '# Project Context', this.projectContext.getContextPrompt());
    }

    if (this.cachedEnvironmentPrompt) {
      parts.push('', this.cachedEnvironmentPrompt);
    }

    return parts.join('\n');
  }

  private async refreshEnvironmentPrompt(): Promise<void> {
    if (!this.environmentResolver?.buildActiveEnvironmentPrompt) {
      this.cachedEnvironmentPrompt = '';
      return;
    }

    try {
      this.cachedEnvironmentPrompt = await this.environmentResolver.buildActiveEnvironmentPrompt(this.projectRoot);
    } catch {
      this.cachedEnvironmentPrompt = '';
    }
  }

  private getLeanPackageHints(): string {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return '';
    }

    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const lines: string[] = [];
      const testScript = typeof pkg?.scripts?.test === 'string' ? pkg.scripts.test : '';

      if (testScript) {
        lines.push(`- npm test -> ${testScript}`);
      }

      if (pkg?.type === 'module') {
        lines.push('- This package uses ESM. Use .js import extensions in JavaScript tests.');
      }

      if (/\bnode\s+--test\b/.test(testScript)) {
        lines.push('- Use node:test and node:assert/strict. Do not use Jest/Vitest globals unless existing tests prove that framework exists.');
        lines.push('- For simple JavaScript node:test files, use `import test from "node:test"` and do not use describe/it/expect globals.');
      }

      return lines.join('\n');
    } catch {
      return '';
    }
  }

  private shouldUseLeanCodeAgent(message: string, hasMentions: boolean): boolean {
    if (hasMentions) {
      return false;
    }

    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 700 || trimmed.includes('@')) {
      return false;
    }

    if (/\b(same|previous|above|that|this|it|again|igual|mesmo|anterior|acima|isso|aquilo|nesse|neste|naquele|de novo)\b/i.test(trimmed)) {
      return false;
    }

    const filePaths = this.getReferencedFilePaths(trimmed);
    if (filePaths.length !== 1) {
      return false;
    }

    const hasCodeAction =
      /\b(add|change|update|modify|fix|implement|validate|throw|test|run|write|create|refactor)\b/i.test(trimmed)
      || /\b(adicion|alter|atualiz|modific|corrij|corrigir|implemen|valid|lanc|lanç|teste|testar|rode|rodar|escrev|crie|criar|refator)\b/i.test(trimmed);

    if (!hasCodeAction) {
      return false;
    }

    const broadScope =
      /\b(architecture|arquitetura|entire|whole|all|every|todos|todas|inteiro|inteira|modules|modulos|m[oó]dulos|project|projeto|app|application|sistema|frontend|backend)\b/i.test(trimmed);

    return !broadScope;
  }

  private getReferencedFilePaths(message: string): string[] {
    const matches = message.match(/\b[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|java|go|rs|php|rb|cs|json|md|css|scss|html|yml|yaml)\b/g) ?? [];
    return Array.from(new Set(matches));
  }

  private buildLeanMiddleware(): any[] {
    return [
      contextEditingMiddleware({
        edits: [
          new ClearToolUsesEdit({
            trigger: { messages: 4 },
            keep: { messages: 2 },
            clearToolInputs: true,
            placeholder: '[lean mode: older tool output omitted]',
          }),
        ],
        tokenCountMethod: 'approx',
      }),
      createMiddleware({
        name: 'lean_tool_budget',
        wrapModelCall: async (request: any, handler: any) => {
          const tools = this.selectLeanStepTools(request.messages ?? [], request.tools ?? []);
          const { toolChoice: _toolChoice, ...requestWithoutToolChoice } = request;
          const leanRequest = {
            ...requestWithoutToolChoice,
            tools,
          };
          const toolChoice = this.getLeanToolChoice(tools);
          return handler(toolChoice ? { ...leanRequest, toolChoice } : leanRequest);
        },
      }),
    ];
  }

  private selectLeanStepTools(messages: BaseMessage[], tools: any[]): any[] {
    const byName = (names: string[]) => names
      .map((name) => tools.find((tool: any) => tool.name === name))
      .filter(Boolean);

    const toolMessages = this.getLeanToolMessages(messages);
    const lastTool = toolMessages.at(-1);
    const previousTool = toolMessages.at(-2);
    const hasEditedFiles = toolMessages.some((message) => ['write_file', 'edit_file'].includes(message.name));

    if (!lastTool) {
      return byName(['read_file']);
    }

    switch (lastTool.name) {
    case 'read_file':
      if (previousTool?.name === 'edit_file') {
        return byName(['shell']);
      }
      return hasEditedFiles
        ? byName(['write_file', 'edit_file', 'shell'])
        : byName(['write_file', 'edit_file']);
    case 'write_file':
      return byName(['shell']);
    case 'edit_file':
      return byName(['read_file', 'shell']);
    case 'shell':
      return this.isLeanShellSuccess(lastTool.content)
        ? []
        : byName(['read_file', 'write_file', 'edit_file', 'shell']);
    default:
      return byName(['read_file', 'write_file', 'edit_file', 'shell']);
    }
  }

  private getLeanToolChoice(tools: any[]): 'required' | undefined {
    return tools.length > 0 ? 'required' : undefined;
  }

  private getLeanToolMessages(messages: BaseMessage[]): Array<{ name: string; content: string }> {
    return messages
      .filter((message: any) => message?._getType?.() === 'tool')
      .map((message: any) => ({
        name: message.name || message.lc_kwargs?.name || '',
        content: this.extractTextFromModelContent(message.content),
      }))
      .filter((message) => message.name);
  }

  private isLeanShellSuccess(output: string): boolean {
    const text = output.toLowerCase();
    if (/exit with error|not ok|#\s*fail\s+[1-9]|referenceerror|syntaxerror|typeerror|error:/.test(text)) {
      return false;
    }
    return /(^|\n)\s*ok\s+\d|#\s*pass\s+[1-9]|command completed with no output/.test(text);
  }

  private sanitizeLeanFinalResponse(response: string, userMessage: string): string {
    const text = response.trim();
    if (!text || !this.hasLeanGreenVerification()) {
      return text;
    }

    const permissionQuestionPattern = /\b(?:quer|deseja|posso|devo|quer que eu|do you want|should i|would you like)\b[\s\S]{0,180}\b(?:implementar|aplicar|fazer|alterar|validar|corrigir|implemente|implement|apply|do|change|fix)\b[\s\S]{0,80}\?/i;
    if (!permissionQuestionPattern.test(text)) {
      return text;
    }

    const cleaned = text
      .replace(permissionQuestionPattern, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (cleaned) {
      return cleaned;
    }

    return this.isLikelyPortuguese(userMessage)
      ? 'Concluido. A alteracao solicitada foi implementada e a verificacao passou.'
      : 'Done. The requested change was implemented and verification passed.';
  }

  private hasLeanGreenVerification(): boolean {
    return this.lastToolOutputs.some(({ tool, output }) => tool === 'shell' && this.isLeanShellSuccess(output));
  }

  private isLikelyPortuguese(message: string): boolean {
    return /[áéíóúâêôãõç]|(?:adicione|altere|corrija|rode|escreva|implemente|validacao|validação|menor|maior)\b/i.test(message);
  }

  private shouldUseCompactChat(message: string, hasMentions: boolean): boolean {
    if (hasMentions) return false;

    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 90 || trimmed.includes('\n')) {
      return false;
    }

    const normalized = trimmed
      .toLowerCase()
      .normalize('NFC')
      .replace(/[.!]+$/g, '')
      .trim();

    return COMPACT_CHAT_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  private async *streamCompactChat(message: string): AsyncGenerator<string> {
    const activeModel = this.model ?? this.multiLlmService.createStreamingModel('default');
    const outboundMessages = [
      new SystemMessage(COMPACT_CHAT_SYSTEM_PROMPT),
      new HumanMessage(message),
    ];

    this.messages.push(new HumanMessage(message));
    this.replayService.recordEntry({ role: 'user', content: message });

    let fullResponse = '';
    let interactionInputTokens = 0;
    let interactionOutputTokens = 0;
    let interactionCachedInputTokens = 0;
    let hasExactUsage = false;

    try {
      if (typeof (activeModel as any).stream === 'function') {
        const stream = await (activeModel as any).stream(outboundMessages);
        for await (const chunk of stream) {
          const text = this.extractTextFromModelContent((chunk as any)?.content ?? chunk);
          if (text) {
            fullResponse += text;
            yield text;
          }

          const usage = this.extractUsage(chunk);
          if (usage.input > 0 || usage.output > 0) {
            interactionInputTokens += usage.input;
            interactionOutputTokens += usage.output;
            interactionCachedInputTokens += usage.cachedInput;
            hasExactUsage = true;
          }
        }
      } else {
        const response = await activeModel.invoke(outboundMessages);
        const text = this.extractTextFromModelContent((response as any)?.content ?? response);
        if (text) {
          fullResponse += text;
          yield text;
        }

        const usage = this.extractUsage(response);
        if (usage.input > 0 || usage.output > 0) {
          interactionInputTokens += usage.input;
          interactionOutputTokens += usage.output;
          interactionCachedInputTokens += usage.cachedInput;
          hasExactUsage = true;
        }
      }
    } catch (error) {
      yield `\n\x1b[31m  Stream error: ${(error as Error).message}\x1b[0m\n`;
      return;
    }

    if (fullResponse) {
      this.messages.push(new AIMessage(fullResponse));
      this.replayService.recordEntry({ role: 'assistant', content: fullResponse });
      this.recordLocalMessage('assistant', fullResponse);
    }

    if (!hasExactUsage) {
      interactionInputTokens = this.estimateTokens(COMPACT_CHAT_SYSTEM_PROMPT + '\n' + message);
      interactionOutputTokens = this.estimateTokens(fullResponse);
    }

    this.tokenCount += interactionInputTokens + interactionOutputTokens;
    this.cumulativeInputTokens += interactionInputTokens;
    this.cumulativeOutputTokens += interactionOutputTokens;
    this.cumulativeCachedInputTokens += interactionCachedInputTokens;

    if (hasExactUsage && (interactionInputTokens > 0 || interactionOutputTokens > 0)) {
      const modelName = (activeModel as any)?.modelName || (activeModel as any)?.model || 'unknown';
      this.statsService.trackUsage(modelName, interactionInputTokens, interactionOutputTokens, interactionCachedInputTokens);
    }
  }

  private extractUsage(output: any): TokenUsage {
    const usage = output?.usage_metadata
      || output?.usageMetadata
      || output?.response_metadata?.usage
      || output?.response_metadata?.usageMetadata
      || output?.response_metadata?.tokenUsage
      || output?.additional_kwargs?.usage
      || output?.additional_kwargs?.usageMetadata;

    if (!usage) {
      return { input: 0, output: 0, cachedInput: 0 };
    }

    return {
      input: usage.input_tokens
        || usage.prompt_tokens
        || usage.promptTokens
        || usage.inputTokens
        || usage.inputTokenCount
        || usage.promptTokenCount
        || 0,
      output: usage.output_tokens
        || usage.completion_tokens
        || usage.completionTokens
        || usage.outputTokens
        || usage.outputTokenCount
        || usage.candidatesTokenCount
        || 0,
      cachedInput: this.extractCachedInputTokens(usage),
    };
  }

  private extractCachedInputTokens(usage: any): number {
    return usage.input_token_details?.cache_read
      || usage.input_token_details?.cached_tokens
      || usage.inputTokenDetails?.cacheRead
      || usage.inputTokenDetails?.cachedTokens
      || usage.input_tokens_details?.cached_tokens
      || usage.inputTokensDetails?.cachedTokens
      || usage.prompt_tokens_details?.cached_tokens
      || usage.promptTokensDetails?.cachedTokens
      || usage.cache_read_input_tokens
      || usage.cacheReadInputTokens
      || usage.prompt_cache_hit_tokens
      || usage.promptCacheHitTokens
      || usage.cached_tokens
      || usage.cachedTokens
      || usage.cached_content_token_count
      || usage.cachedContentTokenCount
      || 0;
  }

  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  }

  private buildSystemPrompt(
    contextPrompt: string,
    memoryPrompt: string,
    subagents: any[],
    tools: any[],
    mcpTools: any[],
    mcpServerSummaries: McpServerSummary[] = [],
    projectStructure: string = '',
  ): string {
    const gitInfo = this.getGitStatus();
    const allToolNames = [
      ...tools.map((t: any) => t.name),
      ...mcpTools.map((t: any) => t.name),
    ];

    const parts: string[] = [];

    const langInstruction = this.i18nService.getAgentLanguageInstruction();
    parts.unshift(langInstruction);

    parts.push(
      'You are Cast, an autonomous AI coding assistant running as a CLI tool.',
      'You are a highly capable agent that can independently explore codebases, make decisions, execute multi-step plans, and delegate work to specialized sub-agents. You help developers with software engineering tasks including writing code, debugging, refactoring, and answering questions about codebases.',
      '',
      'Tone & personality: Be casual and direct — like a sharp senior dev colleague on Slack. Skip formalities and corporate speak. Be concise, practical, and conversational. Use informal language naturally. It\'s fine to be a little witty, but stay focused and don\'t over-explain. Get to the point fast.',
      '',
    );

    if (projectStructure) {
      parts.push(
        '# Project Overview',
        '',
        projectStructure,
        '',
      );
    }

    parts.push(
      '# CRITICAL RULES',
      '',
      '## NEVER Guess — ALWAYS Verify',
      '- NEVER say a file "doesn\'t exist" without FIRST using glob or read_file to check',
      '- NEVER guess file contents — ALWAYS read_file before answering about a file',
      '- NEVER assume a directory structure — ALWAYS use ls or glob to discover it',
      '- NEVER say "I don\'t have access" — you DO have access through your tools',
      '- If a user mentions a file path, your FIRST action must be to read it or verify it exists',
      '',
      '## Read Before Edit',
      '- ALWAYS use read_file on a file before using edit_file or write_file on it',
      '- NEVER edit a file you haven\'t read in this conversation',
      '- Understand existing code before suggesting modifications',
      '',
      '## Minimal Changes',
      '- Only make changes that are directly requested or clearly necessary',
      '- Don\'t add features, refactor code, or make "improvements" beyond what was asked',
      '- Don\'t add docstrings, comments, or type annotations to code you didn\'t change',
      '- Preserve existing code style and conventions',
      '',
      ADAPTIVE_TEST_FIRST_WORKFLOW_PROMPT,
      '',
      '## Tool Use Discipline',
      '- ALWAYS read a file before editing it — never edit from memory',
      '- After EVERY edit_file or write_file, re-read the file to verify the change was applied correctly',
      '- When exploring: glob → grep → read (narrow before broad)',
      '- Never call the same tool twice with the same inputs — if it failed, try a different approach',
      '- Before editing any file that exports public symbols, call analyze_impact(file) to understand downstream effects',
      '',
    );

    const builtInCount = tools.length;
    const mcpCount = mcpTools.length;
    const discoveryCount = 2;

    parts.push(
      '# Available Tools',
      '',
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
      '',
      'USE THEM PROACTIVELY.',
      '',
    );

    if (tools.length > 0) {
      parts.push('## Built-in Tools');
      for (const t of tools) {
        parts.push(`- **${t.name}**: ${t.description}`);
      }
      parts.push('');
    }

    if (mcpTools.length > 0) {
      parts.push('## MCP Tools (External Services)');
      parts.push('');
      parts.push('**⚠️ Important**: Only tools from servers with status "connected" are available. Tools from disconnected servers will fail.');
      parts.push('');

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
      parts.push('## MCP Discovery Tools');
      parts.push('- **mcp_list_servers**: List all connected MCP servers with status and tool counts');
      parts.push('- **mcp_list_tools**: List tools from a specific server or all servers');
      parts.push('');
    }

    parts.push(
      '# Task Management & Kanban Board',
      'You are integrated with a live Kanban Board. The board is the source of truth for the user to see your progress.',
      '- **CRITICAL**: Whenever you start working on a task, you MUST call **task_update** with status="in_progress".',
      '- **CRITICAL**: When a task is implemented and ready for human validation, you MUST call **task_update** with status="test".',
      '- Use **task_create** to break complex work into trackable subtasks. They will appear on the board instantly.',
      '- Use **task_list** to see what\'s on your plate.',
      '- Use **ask_user_question** when you need clarification BEFORE acting.',
      '',
      '## Memory',
      '- Use **memory_write** to save important learnings and project insights',
      '- Use **memory_read** to recall previously saved notes',
      '- Memory persists across sessions — use it to avoid repeating mistakes',
      '',
    );

    if (mcpTools.length > 0) {
      parts.push(
        '# MCP Integration Protocol',
        '',
        'MCP (Model Context Protocol) tools connect you to external services. They work exactly like built-in tools but reach outside the local filesystem.',
        '',
        '## Connected Servers',
      );
      if (mcpServerSummaries.length > 0) {
        for (const s of mcpServerSummaries) {
          parts.push(`- **${s.name}** (${s.transport}, ${s.status}) — ${s.toolCount} tools`);
        }
      }
      parts.push(
        '',
        '## When to Use MCP vs Built-in',
        '| Need | Use |',
        '|------|-----|',
        '| Read/write local files | Built-in (read_file, write_file, edit_file) |',
        '| Search local codebase | Built-in (glob, grep) |',
        '| Run commands | Built-in (shell) |',
        '| Interact with external APIs/services | MCP tools |',
        '| Discover available MCP capabilities | mcp_list_servers, mcp_list_tools |',
        '',
        '## MCP Tool Naming Convention',
        'MCP tools follow the pattern `{server}_{tool}` (e.g., `figma_get_file`, `github_create_issue`).',
        'The prefix tells you which server provides the tool.',
        '',
        '## Discovery',
        '- Use **mcp_list_servers** to see which servers are connected and their status',
        '- Use **mcp_list_tools** to explore what tools a server provides (with descriptions)',
        '- When you\'re unsure which MCP tool to use, call mcp_list_tools first',
        '',
        '## Error Handling',
        '- If an MCP tool returns an error, check the server status with mcp_list_servers',
        '- MCP servers can disconnect — if a tool fails, the server may need reconnection',
        '- Report MCP errors to the user and suggest they check /mcp list in the REPL',
        '',
      );
    }

    parts.push(
      '# Planning Protocol',
      '',
      '## When to Enter Plan Mode',
      'Use **enter_plan_mode** when:',
      '- Task touches 3+ files',
      '- Task involves new features or architecture changes',
      '- Task is ambiguous and needs scope definition',
      '- User explicitly asks for a plan',
      '',
      'Do NOT plan for: simple fixes, single-file edits, questions, explanations',
      '',
      '## Plan Mode Workflow',
      '1. **enter_plan_mode** — signals you are planning',
      '2. **Explore FIRST**: Use glob and grep to understand the codebase BEFORE asking anything',
      '3. **Design**: Create structured plan with specific file changes and order',
      '4. **exit_plan_mode** — present plan for approval',
      '5. **Execute immediately** after approval without asking for further confirmation',
      '',
      '## Critical: Explore Before Asking',
      'NEVER ask the user clarifying questions before exploring the codebase.',
      'Read the project structure, existing files, and patterns FIRST.',
      'Only use ask_user_question if — AFTER exploring — there is still genuinely ambiguous information that cannot be inferred from the code.',
      '',
      '## Critical: Autonomous Execution',
      'AFTER the user approves your plan, you MUST:',
      '- Start implementing immediately',
      '- Create tasks and execute them sequentially',
      '- Do NOT ask "should I proceed?" or "ready to start?"',
      '- Do NOT wait for additional confirmation',
      '- Just execute the approved plan autonomously',
      '',
      '## Plan Quality Rules',
      '- Specify WHAT changes and WHY for each file',
      '- Order by dependency (foundations first)',
      '- Include verification at the end',
      '',
    );

    if (subagents.length > 0) {
      parts.push(
        '# Sub-Agent Orchestration',
        '',
        `You have ${subagents.length} specialized sub-agents available. Each has domain-specific knowledge and tools.`,
        'Use list_agents for a full interactive listing at any time.',
        '',
        '## Available Sub-Agents',
        '',
      );
      for (const sa of subagents) {
        const mcpNote = sa.mcp && sa.mcp.length > 0 ? `\n**MCP access:** ${sa.mcp.join(', ')}` : '';
        const bullets: string[] = [];
        if (sa.systemPrompt) {
          for (const line of sa.systemPrompt.split('\n')) {
            if (bullets.length >= 3) break;
            const m = line.trim().match(/^(?:[-*]|\d+\.)\s+(.+)/);
            if (m && m[1]) {
              const text = m[1].trim();
              if (text.length > 0) bullets.push(text.length > 80 ? text.slice(0, 77) + '...' : text);
            }
          }
        }
        const specializes = bullets.length > 0
          ? bullets.map((b) => `  - ${b}`).join('\n')
          : '  (see list_agents for details)';
        parts.push(
          `### ${sa.name}`,
          `**Role:** ${sa.description}${mcpNote}`,
          '**Specializes in:**',
          specializes,
          '**Dispatch in background:**',
          `  → delegate to agent: "${sa.name}" with a focused task description`,
          '  → include all necessary context in the task',
          '  → track with task_create before dispatching',
          '',
        );
      }
      parts.push(
        '## When to Delegate to Sub-Agents',
        '- Task requires specialized domain knowledge (React, testing, API design, databases)',
        '- Multiple independent subtasks can be worked on in parallel',
        '- Task is well-defined and self-contained (a sub-agent can complete it without further guidance)',
        '- You want a focused review or analysis (e.g., code review, architecture review)',
        '',
        '## When NOT to Delegate',
        '- Simple tasks you can do yourself quickly',
        '- Tasks that require back-and-forth with the user',
        '- Tasks that depend heavily on earlier context in this conversation',
        '',
        '## Delegation Pattern',
        '1. Identify the task and which sub-agent is best suited',
        '2. Create a clear, specific task description with all necessary context',
        '3. Delegate execution to that sub-agent (do not stop at planning only)',
        '4. Track delegated work with task_create/task_update',
        '5. When the sub-agent returns, verify the result and integrate it',
        '6. Mark the task as completed',
        '',
        '## Delegation Quality Bar',
        '- If user explicitly asks to use a specific sub-agent, you MUST delegate to it',
        '- For frontend UI generation from Figma, prefer the frontend sub-agent when available',
        '- Avoid fake delegation: creating tasks without executing delegated work is not enough',
        '- Return concrete delegated outputs (files changed, decisions made, validations run)',
        '',
        '## Multi-Agent Coordination',
        'For large tasks, you can orchestrate multiple sub-agents:',
        '1. Break the work into independent pieces',
        '2. Assign each piece to the most qualified sub-agent',
        '3. Track progress with task_create/task_update',
        '4. Integrate results and verify the combined output',
        '',
        '## MCP-Aware Delegation',
        'When a task involves heavy interaction with an external service (e.g., fetching Figma designs, managing GitHub issues):',
        '- Check which sub-agents have MCP access (shown in [MCP access] above)',
        '- Delegate MCP-heavy work to the sub-agent with the right MCP connection',
        '- If no sub-agent has the needed MCP, handle it yourself using the MCP tools directly',
        '- Include the MCP server name in the task description so the sub-agent knows which tools to use',
        '',
      );
    }

    parts.push(
      '# Execution Protocol',
      '',
      '## Exploring a Project',
      '1. ls the project root with `ls .` — NEVER use `ls /` (that is the system root, not the project)',
      '2. Read key config files (package.json, tsconfig.json, etc.)',
      '3. glob to map directory tree with key patterns',
      '4. Read the most important files (entry points, main modules)',
      '5. Present a structured summary',
      'Be EXHAUSTIVE. Read as many files as needed.',
      '',
      '## Implementing Changes',
      '1. Understand the current codebase (read relevant files)',
      '2. If complex (3+ files): use enter_plan_mode',
      '3. Create a task list with task_create for each step',
      '4. Execute each step, marking tasks as completed',
      '5. Verify changes (re-read edited files, run tests)',
      '6. Summarize what was done',
      '',
      '## Tool Chain Patterns',
      '- **Find something**: glob → grep → read_file',
      '- **Edit a file**: read_file → edit_file → read_file (verify)',
      '- **Explore a module**: ls → glob("module/**/*") → read_file (key files)',
      '- **Debug an issue**: grep (error) → read_file → edit_file → shell (test)',
      '- **New feature**: enter_plan_mode → task_create → [implement] → shell (test)',
      '',
      '## Thoroughness Rules',
      '- NEVER give up after one failed search. Try different patterns and approaches.',
      '- ALWAYS verify changes by re-reading the file after editing.',
      '- If tests exist, run them after changes: shell("npm test") or equivalent.',
      '- When you encounter an error, analyze and fix it — don\'t just report it.',
      '- If blocked, try a different approach. If still blocked, ask the user.',
      '',
      '## Error Recovery Protocol',
      '1. Build fails after your change → read the error, read the changed files, fix the root cause',
      '2. Tool call returns an error → try a different approach, NOT the same call again',
      '3. Test fails → analyze the failure message before touching code',
      '4. Unexpected file state → read it first, understand what happened',
      '5. NEVER give up and report "I can\'t do this". Always try at least 3 different approaches.',
      '',
      '## Self-Verification (run before saying "done")',
      '- Re-read every file you edited',
      '- Run npm run build (or equivalent) to verify no compilation errors',
      '- Summarize: what changed, what files, what was the outcome',
      '',
    );

    parts.push(
      '# Autonomous Decision-Making',
      '',
      'You are an autonomous agent. Make decisions proactively:',
      '',
      '## Decision Framework',
      '| Situation | Action |',
      '|-----------|--------|',
      '| User asks to implement something | Explore first, then plan if complex |',
      '| You find a bug while working | Fix it AND mention it to the user |',
      '| Test fails after your change | Analyze the failure and fix it |',
      '| Build fails | Read the error, fix the cause |',
      '| File you need doesn\'t exist | Search broader, check for alternatives |',
      '| Task is ambiguous | Explore codebase first, then ask_user_question if still unclear |',
      '| Task has multiple approaches | Briefly explain options, pick the best one |',
      '| Something could break | Use enter_plan_mode and verify |',
      '',
      '## Self-Correction',
      '- After editing, always re-read the file to verify the change is correct',
      '- If a tool call fails, understand why and adjust (don\'t retry the same thing)',
      '- If your approach isn\'t working after 3 attempts, step back and reconsider',
      '- Save important learnings with memory_write so you don\'t repeat mistakes',
      '',
    );

    parts.push(
      '# Git Safety Protocol',
      '- NEVER update git config',
      '- NEVER run destructive git commands (push --force, reset --hard, clean -f) without explicit user request',
      '- NEVER skip hooks (--no-verify) unless user explicitly requests it',
      '- When committing: stage specific files (not "git add -A"), write clear commit messages',
      '- When creating PRs: summarize all commits, not just the latest',
      '',
    );

    parts.push(
      '# Response Style',
      '- Be concise in responses but thorough in your work',
      '- Show your work: mention which tools you\'re using and why',
      '- When showing code changes, explain WHAT changed and WHY',
      '- Use markdown formatting for readability',
      '- Reference files with their path (e.g., "In src/main.ts:")',
      '',
    );

    parts.push(
      '# User Mentions',
      'When the user\'s message contains <file>, <directory>, <url>, or <git> tags,',
      'these are automatically injected file/directory contents from @ mentions.',
      'The content inside these tags is REAL and CURRENT — trust it and use it to answer.',
      'Do NOT re-read a file that was already provided via a mention tag unless you need a different section.',
      '',
    );

    const skillCount = this.skillRegistry.getSkillNames().length;
    if (skillCount > 0) {
      parts.push(
        '# Domain Knowledge',
        '',
        `You have ${skillCount} skills available. Use **list_skills** to discover them and **read_skill(name)** to load full content.`,
        'Use **list_agents** to see available sub-agents.',
        '',
      );
    }

    parts.push(
      '# Environment',
      `- Working directory: ${this.projectRoot}`,
      `- Platform: ${process.platform}`,
      `- Node.js: ${process.version}`,
      '',
      '**IMPORTANT:** All file and shell operations MUST happen inside the working directory above.',
      'Do NOT create directories or files outside of it (e.g., do NOT use ~/some-new-folder or /home/user/new-project).',
      'When asked to scaffold a new project or feature, create it as a subdirectory of the working directory.',
      '',
      '# Git Status (snapshot)',
      gitInfo,
      '',
    );

    if (contextPrompt) {
      parts.push(contextPrompt, '');
    }

    if (memoryPrompt) {
      parts.push(
        '# Auto Memory',
        'These are notes from previous sessions:',
        memoryPrompt,
        '',
      );
    }

    return parts.join('\n');
  }

  private formatToolStart(toolName: string, input: any): string {
    const dim = '\x1b[2m';
    const cyan = '\x1b[36m';
    const reset = '\x1b[0m';
    let detail = '';

    const filePath = (i: any): string => {
      if (!i) return '';
      if (typeof i === 'string') return i;
      const v = i.file_path || i.path || i.filename || i.file || i.filepath;
      if (v) return String(v);
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
    case 'rag_search':
      detail = input?.query ? ` "${String(input.query).slice(0, 80)}${String(input.query).length > 80 ? '...' : ''}"` : '';
      if (input?.topK) detail += ` topK=${input.topK}`;
      break;
    case 'task': {
      const agentName = input?.subagent_type || input?.agent || input?.name;
      const description = input?.description || input?.task || input?.prompt;
      detail = agentName ? ` agent ${agentName}` : '';
      if (description) {
        const text = String(description);
        detail += ` "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`;
      }
      break;
    }
    case 'list_skills':
      detail = ' available';
      break;
    case 'read_skill':
      detail = input?.name ? ` ${input.name}` : '';
      break;
    case 'list_agents':
      detail = ' available';
      break;
    case 'cast_command':
      detail = input?.command ? ` ${input.command}` : '';
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

    const toolLabel = toolName.replace(/_/g, ' ');
    return `\n${dim}  \u25b6 ${reset}${dim}${cyan}${toolLabel}${reset}${dim}${detail}${reset}\n`;
  }

  private formatToolEnd(toolName: string, output: string): string {
    if (!output || output.length === 0) return '';

    const dim = '\x1b[2m';
    const green = '\x1b[32m';
    const red = '\x1b[31m';
    const reset = '\x1b[0m';

    const ok = (msg: string) => `${dim}    ${green}\u2713${reset}${dim} ${msg}${reset}\n`;
    const err = (msg: string) => `${dim}    ${red}\u2717${reset}${dim} ${msg}${reset}\n`;
    const rows = (lines: string[], max: number, lineMax = 130) => {
      const visible = lines.slice(0, max);
      const more = lines.length > max ? lines.length - max : 0;
      let out = visible.map(l => `${dim}    ${l.slice(0, lineMax)}${reset}`).join('\n');
      if (more > 0) out += `\n${dim}    \u2026 ${more} more${reset}`;
      return out + '\n';
    };

    switch (toolName) {
    case 'read_file': {
      const lineCount = output.split('\n').length;
      const bytes = output.length;
      return ok(`${lineCount} lines, ${bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB'}`);
    }
    case 'write_file':
      return ok(output.length > 160 ? output.slice(0, 159) + '…' : output);
    case 'edit_file': {
      if (output.startsWith('Error') || output.startsWith('error')) {
        return err(output.length > 160 ? output.slice(0, 159) + '…' : output);
      }
      return ok(output.length > 160 ? output.slice(0, 159) + '…' : output);
    }
    case 'glob': {
      const lines = output.split('\n').filter(l => l.trim());
      if (lines.length === 0) return `${dim}    no matches${reset}\n`;
      return rows(lines, 6, 100);
    }
    case 'grep': {
      const lines = output.split('\n').filter(l => l.trim());
      if (lines.length === 0) return `${dim}    no matches${reset}\n`;
      return rows(lines, 6, 120);
    }
    case 'shell':
    case 'shell_background': {
      const lines = output.split('\n').filter((_, i) => i === 0 || output.split('\n')[i].trim());
      return rows(lines, 8, 150);
    }
    case 'ls': {
      const lines = output.split('\n').filter(l => l.trim());
      return rows(lines, 10, 100);
    }
    case 'web_search': {
      const lines = output.split('\n').filter(l => l.trim());
      return rows(lines, 5, 120);
    }
    case 'web_fetch': {
      const lines = output.split('\n').filter(l => l.trim());
      return rows(lines, 4, 120);
    }
    case 'memory_write':
      return ok('saved');
    case 'memory_read':
    case 'memory_search': {
      const lines = output.split('\n').filter(l => l.trim());
      return rows(lines, 4, 120);
    }
    case 'rag_search': {
      const lines = output.split('\n').filter(l => l.trim());
      return rows(lines, 6, 140);
    }
    case 'cast_command':
      if (/denied/i.test(output)) {
        return err('Cast command denied');
      }
      return ok('Output returned to Cast');
    default: {
      const lines = output.split('\n').filter(l => l.trim());
      return rows(lines, 4, 120);
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
      const summaryModel = this.multiLlmService.createModel('cheap', false);
      const summaryResponse = await summaryModel.invoke([
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

  async saveSessionSummaryToMemory(options: { timeoutMs?: number } = {}): Promise<SessionSummarySaveResult> {
    if (!this.memoryService.isInitialized()) {
      return { saved: false, reason: 'memory_unavailable' };
    }

    if (this.messages.length < 4) {
      return { saved: false, reason: 'too_few_messages' };
    }

    const replayName = this.buildSessionSummaryName();
    const replay = this.saveReplaySnapshot(replayName);
    const summary = await this.generateSessionMemorySummary(options.timeoutMs ?? 7000);
    if (!summary) {
      return { saved: false, reason: 'summarization_failed', replayPath: replay.filePath };
    }

    const filename = `${replayName}.md`;
    const content = this.buildSessionMemoryContent(summary, replay);
    const result = await this.memoryService.write(filename, content);
    if (!/^Memory saved:/i.test(result)) {
      return { saved: false, reason: 'memory_write_failed', filename, replayPath: replay.filePath };
    }

    return { saved: true, filename, replayPath: replay.filePath };
  }

  private buildSessionSummaryName(): string {
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace(/Z$/, 'z');
    return `session-summary-${timestamp}`;
  }

  private saveReplaySnapshot(name: string): SavedReplaySnapshot {
    const service = this.replayService as ReplayService & {
      saveSnapshot?: (name: string) => SavedReplaySnapshot;
    };
    if (typeof service.saveSnapshot === 'function') {
      return service.saveSnapshot(name);
    }
    service.save(name);
    return {
      name,
      fileName: `${name}.json`,
      filePath: path.join(process.env.CAST_REPLAYS_DIR || path.join(process.env.HOME || '', '.cast', 'replays'), `${name}.json`),
      entries: this.messages.length,
    };
  }

  private async generateSessionMemorySummary(timeoutMs: number): Promise<string> {
    const conversationText = this.buildSessionSummaryConversationText();
    if (!conversationText) {
      return '';
    }

    try {
      const summaryModel = this.multiLlmService.createModel('cheap', false);
      const response = await this.withTimeout(
        summaryModel.invoke([
          new SystemMessage([
            'You summarize a Cast Code CLI session for future local memory.',
            'Persist only durable context: decisions, user preferences, completed work, pending follow-ups, and relevant file/module names.',
            'Do not include raw secrets, API keys, long tool outputs, or full diffs.',
            'Keep it under 350 words. Output only the summary.',
          ].join('\n')),
          new HumanMessage(conversationText),
        ]),
        timeoutMs,
      );
      const text = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
      return this.redactSensitiveText(this.truncateText(text.trim(), 3500));
    } catch {
      return '';
    }
  }

  private buildSessionSummaryConversationText(): string {
    const lines: string[] = [];
    let total = 0;
    const maxTotal = 12000;
    const recentMessages = this.messages.slice(-80);

    for (let index = recentMessages.length - 1; index >= 0; index--) {
      const message = recentMessages[index];
      const role = message._getType() === 'human'
        ? 'User'
        : message._getType() === 'ai'
          ? 'Assistant'
          : 'System';
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      const line = `${role}: ${this.truncateText(content.replace(/\s+/g, ' ').trim(), 900)}`;
      if (total + line.length > maxTotal) {
        break;
      }
      total += line.length;
      lines.unshift(line);
    }

    return lines.join('\n');
  }

  private buildSessionMemoryContent(summary: string, replay: SavedReplaySnapshot): string {
    return [
      '# Session Summary',
      '',
      `Date: ${new Date().toISOString()}`,
      `Replay path: ${replay.filePath}`,
      `Replay command: /replay show ${replay.name}`,
      `Replay entries: ${replay.entries}`,
      '',
      '## Summary',
      '',
      summary,
      '',
    ].join('\n');
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('summary timeout')), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private truncateText(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max)}...`;
  }

  private redactSensitiveText(value: string): string {
    return value
      .replace(/\b(?:sk|csk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_KEY]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');
  }

  async *chat(message: string): AsyncGenerator<string> {
    const summarized = await this.autoSummarize();
    if (summarized) {
      yield `\n\x1b[2m  \u2500 conversation compacted (${this.messages.length} messages retained)\x1b[0m\n`;
    }

    if (this.pendingContextRefresh) {
      this.pendingContextRefresh = false;
      this.cachedProjectStructure = await this.projectContext.getProjectStructureSummary(this.projectRoot);
    }

    const hasMentions = message.includes('@');
    this.recordLocalMessage('user', message);
    if (this.shouldUseCompactChat(message, hasMentions)) {
      yield* this.streamCompactChat(message);
      return;
    }

    const useLeanAgent = this.shouldUseLeanCodeAgent(message, hasMentions);
    let activeAgent = this.agent;

    if (useLeanAgent) {
      const leanPrompt = this.buildLeanSystemPrompt();
      if (!this.leanAgent || leanPrompt !== this.cachedLeanSystemPrompt) {
        const leanModel = this.model ?? this.multiLlmService.createStreamingModel('default');
        this.model = leanModel;
        this.cachedLeanSystemPrompt = leanPrompt;
        this.leanAgent = createAgent({
          model: leanModel,
          systemPrompt: leanPrompt,
          tools: this.cachedLeanTools,
          middleware: this.buildLeanMiddleware(),
        });
      }
      activeAgent = this.leanAgent;
    } else {
      const layers = this.getPromptLayers(message, hasMentions);
      const contextualPrompt = this.buildContextualPrompt(message, hasMentions, layers);
      const activeTools = this.selectContextTools(layers);
      const activeSubagents = this.selectContextSubagents(message, layers);
      const toolKey = this.getToolKey(activeTools);
      const subagentKey = this.getSubagentKey(activeSubagents);
      if (
        contextualPrompt !== this.cachedSystemPrompt
        || toolKey !== this.cachedAgentToolKey
        || subagentKey !== this.cachedAgentSubagentKey
      ) {
        this.cachedSystemPrompt = contextualPrompt;
        this.cachedAgentToolKey = toolKey;
        this.cachedAgentSubagentKey = subagentKey;
        this.agent = createDeepAgent({
          model: this.model ?? undefined,
          systemPrompt: contextualPrompt,
          tools: activeTools,
          subagents: activeSubagents,
          backend: () => this.createFilesystemBackend(),
        });
      }
      activeAgent = this.agent;
    }

    const currentUserMessage = new HumanMessage(message);
    this.messages.push(currentUserMessage);
    this.replayService.recordEntry({ role: 'user', content: message });
    this.lastToolOutputs = [];

    const effort = this.multiLlmService.getCurrentEffortProfile();
    let stream: any;
    try {
      stream = activeAgent.streamEvents(
        { messages: useLeanAgent ? [currentUserMessage] : this.messages },
        { version: 'v2', recursionLimit: Math.max(8, effort.maxToolCalls * 2) },
      );
    } catch (error) {
      yield `\n\x1b[31m  Error starting agent: ${(error as Error).message}\x1b[0m\n`;
      return;
    }

    let fullResponse = '';
    let lastToolName = '';
    let interactionInputTokens = 0;
    let interactionOutputTokens = 0;
    let interactionCachedInputTokens = 0;
    let leanResponseBuffer = '';
    const pendingToolInputs: { name: string; input: any }[] = [];
    const activeLocalToolCalls = new Map<string, { name: string; input: unknown; startedAt: number }>();
    let localToolSequence = 0;
    let lastLocalToolKey = '';

    try {
      for await (const event of stream) {
        if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
          const text = this.extractTextFromModelContent(event.data.chunk.content);
          if (text) {
            if (useLeanAgent) {
              leanResponseBuffer += text;
            } else {
              yield text;
              fullResponse += text;
            }
          }
        }

        if (event.event === 'on_chat_model_end') {
          const output = event.data?.output;
          if (!fullResponse && !leanResponseBuffer && output?.content) {
            const fallbackText = this.extractTextFromModelContent(output.content);
            if (fallbackText) {
              if (useLeanAgent) {
                leanResponseBuffer += fallbackText;
              } else {
                yield fallbackText;
                fullResponse += fallbackText;
              }
            }
          }
          const usage = output?.usage_metadata
            || output?.response_metadata?.usage;
          if (usage) {
            const extracted = this.extractUsage(output);
            interactionInputTokens += extracted.input;
            interactionOutputTokens += extracted.output;
            interactionCachedInputTokens += extracted.cachedInput;
          }
          const toolCalls = output?.tool_calls ?? output?.additional_kwargs?.tool_calls;
          if (Array.isArray(toolCalls)) {
            for (const tc of toolCalls) {
              try {
                const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
                pendingToolInputs.push({ name: tc.name, input: args });
              } catch {}
            }
          }
        }

        if (event.event === 'on_tool_start') {
          lastToolName = event.name;
          let toolInput = event.data?.input;
          if (!toolInput || Object.keys(toolInput ?? {}).length === 0) {
            const idx = pendingToolInputs.findIndex(t => t.name === event.name);
            if (idx !== -1) {
              toolInput = pendingToolInputs[idx].input;
              pendingToolInputs.splice(idx, 1);
            }
          }
          lastLocalToolKey = String(event.run_id ?? `${event.name}:${++localToolSequence}`);
          activeLocalToolCalls.set(lastLocalToolKey, {
            name: event.name,
            input: toolInput,
            startedAt: Date.now(),
          });
          yield this.formatToolStart(event.name, toolInput);
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
          const localToolKey = String(event.run_id ?? lastLocalToolKey);
          const localTool = activeLocalToolCalls.get(localToolKey) ?? {
            name: event.name || lastToolName,
            input: undefined,
            startedAt: Date.now(),
          };
          activeLocalToolCalls.delete(localToolKey);
          this.recordLocalToolCall({
            toolName: localTool.name || lastToolName || 'tool',
            inputRedacted: this.serializeForLocalState(localTool.input),
            outputPreview: output,
            status: 'ok',
            latencyMs: Math.max(0, Date.now() - localTool.startedAt),
          });
        }

        if (event.event === 'on_tool_error') {
          const error = event.data?.error;
          const localToolKey = String(event.run_id ?? lastLocalToolKey);
          const localTool = activeLocalToolCalls.get(localToolKey) ?? {
            name: event.name || lastToolName,
            input: undefined,
            startedAt: Date.now(),
          };
          activeLocalToolCalls.delete(localToolKey);
          this.recordLocalToolCall({
            toolName: localTool.name || lastToolName || 'tool',
            inputRedacted: this.serializeForLocalState(localTool.input),
            outputPreview: error?.message || 'Unknown error',
            status: 'error',
            latencyMs: Math.max(0, Date.now() - localTool.startedAt),
          });
          yield `\n\x1b[31m  \u2717 Error: ${error?.message || 'Unknown error'}\x1b[0m\n`;
        }
      }
    } catch (error) {
      const msg = (error as Error).message;
      if (!msg.includes('abort') && !msg.includes('cancel')) {
        yield `\n\x1b[31m  Stream error: ${msg}\x1b[0m\n`;
      }
    }

    if (useLeanAgent && leanResponseBuffer.trim()) {
      const finalResponse = this.sanitizeLeanFinalResponse(leanResponseBuffer, message);
      if (finalResponse) {
        yield finalResponse;
        fullResponse = finalResponse;
      }
    }

    if (fullResponse) {
      this.messages.push(new AIMessage(fullResponse));
      this.replayService.recordEntry({ role: 'assistant', content: fullResponse });
      this.recordLocalMessage('assistant', fullResponse);
    }

    this.tokenCount += interactionInputTokens + interactionOutputTokens;
    this.cumulativeInputTokens += interactionInputTokens;
    this.cumulativeOutputTokens += interactionOutputTokens;
    this.cumulativeCachedInputTokens += interactionCachedInputTokens;

    if (interactionInputTokens > 0 || interactionOutputTokens > 0) {
      const modelName = (this.model as any)?.modelName || (this.model as any)?.model || 'unknown';
      this.statsService.trackUsage(modelName, interactionInputTokens, interactionOutputTokens, interactionCachedInputTokens);
    }
  }

  async runBenchmarkPrompt(prompt: string): Promise<{ output: string; tokens: number; cost: number }> {
    const before = this.getSessionTokenUsage();
    let output = '';
    for await (const chunk of this.chat(prompt)) {
      output += chunk;
    }
    const after = this.getSessionTokenUsage();

    return {
      output,
      tokens: Math.max(0, (after.input + after.output) - (before.input + before.output)),
      cost: 0,
    };
  }

  private recordLocalMessage(role: 'user' | 'assistant' | 'system' | 'tool', content: string): void {
    if (!this.localSessionStore || !this.localSessionId || !content) {
      return;
    }

    void this.localSessionStore.recordMessage({
      sessionId: this.localSessionId,
      role,
      redactedContent: content,
    }).catch(() => undefined);
  }

  private recordLocalToolCall(input: {
    toolName: string;
    inputRedacted?: string;
    outputPreview?: string;
    status: 'ok' | 'error' | 'denied' | 'cancelled';
    latencyMs?: number;
  }): void {
    if (!this.localSessionStore || !this.localSessionId) {
      return;
    }

    void this.localSessionStore.recordToolCall({
      sessionId: this.localSessionId,
      toolName: input.toolName,
      inputRedacted: input.inputRedacted,
      outputPreview: input.outputPreview,
      status: input.status,
      latencyMs: input.latencyMs,
    }).catch(() => undefined);
  }

  private serializeForLocalState(value: unknown): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    try {
      const serialized = JSON.stringify(value);
      return serialized === undefined ? String(value) : serialized;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return `[unserializable local state payload: ${reason}]`;
    }
  }

  clearHistory() {
    this.messages = [];
    this.tokenCount = 0;
    this.cumulativeInputTokens = 0;
    this.cumulativeOutputTokens = 0;
    this.cumulativeCachedInputTokens = 0;
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

  getSessionTokenUsage(): TokenUsage {
    return {
      input: this.cumulativeInputTokens,
      output: this.cumulativeOutputTokens,
      cachedInput: this.cumulativeCachedInputTokens,
    };
  }

  getLastInteractionTokens(): TokenUsage {
    return this.getSessionTokenUsage();
  }

  getLastToolOutputs(): { tool: string; output: string }[] {
    return this.lastToolOutputs;
  }

  async executeTask(
    task: Task,
  ): Promise<{ success: boolean; error?: string; output?: string }> {
    this.permissionService.setHeadless(true);
    try {
      const message = [
        'Voce esta executando uma tarefa de um plano ja aprovado.',
        'NAO use enter_plan_mode nem exit_plan_mode nesta tarefa.',
        `Tarefa:\n**${task.subject}**\n\n${task.description}`,
        'Implemente diretamente o que foi pedido e valide o resultado.',
        'Quando terminar, responda com um resumo objetivo do que foi feito e do que o usuario deve verificar no frontend.',
      ].join('\n\n');

      let fullResponse = '';
      for await (const chunk of this.chat(message)) {
        fullResponse += chunk;
        process.stdout.write(chunk);
      }

      return { success: true, output: fullResponse.trim() };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    } finally {
      this.permissionService.setHeadless(false);
    }
  }
}
