import { Injectable, Optional } from '@nestjs/common';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as fs from 'fs/promises';
import { randomUUID } from 'node:crypto';
import * as path from 'path';
import { glob } from 'glob';
import { getQuickJS } from 'quickjs-emscripten';
import { z } from 'zod';
import { LlmClientFactory } from '../../../common/services/llm-client.factory';
import type { LlmClient } from '../../../common/interfaces/llm-client.interface';
import { castTool, type CastTool } from '../../../common/interfaces/cast-tool.interface';
import type { Message } from '../../../common/types/llm.types';
import { CastAgentEngine } from './cast-agent-engine.service';
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
import { StatsService } from '../../stats/services/stats.service';
import { ReplayService, SavedReplaySnapshot } from '../../replay/services/replay.service';
import { I18nService } from '../../i18n/services/i18n.service';
import { FileWatcherService, FILE_CHANGE_EVENT } from '../../watcher/services/file-watcher.service';
import { PromptLoaderService } from './prompt-loader.service';
import { PromptClassifierService, PromptLayer } from './prompt-classifier.service';
import { PlatformService } from '../../platform/services/platform.service';
import { LocalSessionStoreService } from '../../state/services/local-session-store.service';
import { EnvironmentResolverService } from '../../environments/services/environment-resolver.service';
import { AgentRunService } from '../../agents/services/agent-run.service';
import { AgentRun } from '../../agents/types/agent-runtime.types';
import { ADAPTIVE_TEST_FIRST_WORKFLOW_PROMPT } from '../../../common/constants';
import { RuntimeTelemetryProjectorService } from '../../runtime/services/runtime-telemetry-projector.service';
import type { CastRuntimeEvent } from '../../runtime/types/runtime-event.types';
import {
  DeepAgentEventAdapterService,
  DeepAgentRuntimeEnvelope,
  DeepAgentStreamVersion,
} from './deep-agent-event-adapter.service';
import type { ChatStreamChunk } from '../../../ui/cast-design/tool-call.types';

interface FileInfo {
  path: string;
  isDirectory?: boolean;
  size?: number;
}

interface LsResult {
  files?: FileInfo[];
  error?: string;
}

interface ReadResult {
  content?: string;
  error?: string;
}

interface ReadRawResult {
  content?: Uint8Array;
  error?: string;
}

interface WriteResult {
  error?: string;
}

interface EditResult {
  error?: string;
}

interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

interface GrepResult {
  matches?: GrepMatch[];
  error?: string;
}

interface GlobResult {
  files?: FileInfo[];
  error?: string;
}

interface FileUploadResponse {
  path: string;
  error: 'permission_denied' | null;
}

interface FileDownloadResponse {
  path: string;
  content: Uint8Array | null;
  error: 'permission_denied' | null;
}

type BaseMessage = {
  role?: string;
  content: unknown;
  name?: string;
  toolName?: string;
  tool_call_id?: string;
  toolCallId?: string;
  lc_kwargs?: Record<string, unknown>;
  _getType?: () => string;
};

class HumanMessage {
  readonly role = 'user';
  constructor(public readonly content: string) {}
  _getType(): string { return 'human'; }
}

class AIMessage {
  readonly role = 'assistant';
  constructor(public readonly content: string) {}
  _getType(): string { return 'ai'; }
}

class SystemMessage {
  readonly role = 'system';
  constructor(public readonly content: string) {}
  _getType(): string { return 'system'; }
}

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

export interface RestorableEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
}

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
  constructor(
    private readonly projectRoot: string,
    private readonly workspaceRoot: string,
  ) {}

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

  async ls(dirPath: string): Promise<LsResult> {
    try {
      const resolved = this.resolvePath(dirPath);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(resolved, entry.name);
        const stat = await fs.stat(entryPath);
        return {
          path: entryPath,
          isDirectory: entry.isDirectory(),
          size: stat.size,
        };
      }));
      return { files };
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
      const content = await fs.readFile(this.resolvePath(filePath), 'utf-8');
      if (offset === undefined && limit === undefined) {
        return { content };
      }
      const lines = content.split('\n');
      const start = Math.max(0, offset ?? 0);
      const end = limit === undefined ? undefined : start + Math.max(0, limit);
      return { content: lines.slice(start, end).join('\n') };
    } catch (error) {
      return { error: `Error reading file '${filePath}': ${(error as Error).message}` };
    }
  }

  async readRaw(filePath: string): Promise<ReadRawResult> {
    try {
      return { content: new Uint8Array(await fs.readFile(this.resolvePath(filePath))) };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    try {
      const resolved = this.resolvePath(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, 'utf-8');
      return {};
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    try {
      const resolved = this.resolvePath(filePath);
      const content = await fs.readFile(resolved, 'utf-8');
      if (!content.includes(oldString)) {
        return { error: `String not found in ${filePath}` };
      }
      const updated = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);
      await fs.writeFile(resolved, updated, 'utf-8');
      return {};
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async grep(pattern: string, dirPath?: string | null, globPattern?: string | null): Promise<GrepResult> {
    try {
      const root = this.resolvePath(dirPath || '.');
      const regex = new RegExp(pattern);
      const matches: GrepMatch[] = [];
      const filePaths = await glob(globPattern || '**/*', {
        cwd: root,
        dot: true,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      for (const filePath of filePaths) {
        const absolutePath = path.join(root, filePath);
        try {
          const content = await fs.readFile(absolutePath, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              matches.push({ path: absolutePath, line: index + 1, text: line });
            }
          });
        } catch {
          // Ignore unreadable or binary files during grep, matching shell grep behavior.
        }
      }

      return { matches };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async grepRaw(pattern: string, dirPath?: string, globPattern?: string | null): Promise<GrepMatch[] | string> {
    const result = await this.grep(pattern, dirPath, globPattern);
    return result.error ? `Error: ${result.error}` : result.matches ?? [];
  }

  async glob(pattern: string, searchPath?: string): Promise<GlobResult> {
    try {
      const root = this.resolvePath(searchPath || '.');
      const matches = await glob(pattern, {
        cwd: root,
        dot: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });
      const files = await Promise.all(matches.map(async (match) => {
        const entryPath = path.join(root, match);
        const stat = await fs.stat(entryPath);
        return {
          path: entryPath,
          isDirectory: stat.isDirectory(),
          size: stat.size,
        };
      }));
      return { files };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  async globInfo(pattern: string, searchPath?: string): Promise<FileInfo[]> {
    const result = await this.glob(pattern, searchPath);
    return result.files ?? [];
  }

  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    const responses: Array<{ path: string; error: 'permission_denied' | null }> = [];
    for (const [filePath, content] of files) {
      try {
        const resolved = this.resolvePath(filePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content);
        responses.push({ path: filePath, error: null });
      } catch {
        responses.push({ path: filePath, error: 'permission_denied' });
      }
    }
    return responses;
  }

  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    const responses: Array<{ path: string; content: Uint8Array | null; error: 'permission_denied' | null }> = [];
    for (const filePath of paths) {
      try {
        const content = new Uint8Array(await fs.readFile(this.resolvePath(filePath)));
        responses.push({ path: filePath, content, error: null });
      } catch {
        responses.push({ path: filePath, content: null, error: 'permission_denied' });
      }
    }
    return responses;
  }
}

@Injectable()
export class DeepAgentService {
  private agent: any;
  private leanAgent: any;
  private model: LlmClient | null = null;
  private messages: BaseMessage[] = [];
  private tokenCount = 0;
  private cumulativeInputTokens = 0;
  private cumulativeOutputTokens = 0;
  private cumulativeCachedInputTokens = 0;
  private lastToolOutputs: { tool: string; output: string }[] = [];

  private cachedSystemPrompt: string = '';
  private cachedLeanSystemPrompt: string = '';
  private cachedBasePrompt: string = '';
  private cachedBuiltinTools: any[] = [];
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
  private codeInterpreterTool?: CastTool;

  constructor(
    private readonly llmClientFactory: LlmClientFactory,
    private readonly agentRegistry: AgentRegistryService,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly projectLoader: ProjectLoaderService,
    private readonly projectContext: ProjectContextService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly memoryService: MemoryService,
    private readonly permissionService: PermissionService,
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
    @Optional()
    private readonly agentRunService?: AgentRunService,
    @Optional()
    private readonly deepAgentEventAdapter?: DeepAgentEventAdapterService,
    @Optional()
    private readonly runtimeTelemetryProjector?: RuntimeTelemetryProjectorService,
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

    this.model = this.llmClientFactory.create('default');
    this.statsService.setUsageListener((event) => {
      this.platformService.track('tokens.consumed', event);
    });

    const modelConfig = (() => {
      try { return (this.llmClientFactory as any).configManager?.getModelConfig('default'); } catch { return null; }
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

    const builtinTools = allTools.filter(t => DEEPAGENT_BUILTIN_TOOLS.has(t.name));
    const extraTools = allTools.filter(t => !DEEPAGENT_BUILTIN_TOOLS.has(t.name));
    const leanTools = this.selectLeanTools(allTools);
    const mcpDiscoveryTools = this.mcpRegistry.getDiscoveryTools();
    this.cachedBasePrompt = this.buildBasePrompt(allTools, subagents);
    const systemPrompt = this.cachedBasePrompt;

    this.cachedSystemPrompt = systemPrompt;
    this.cachedBuiltinTools = builtinTools;
    this.cachedExtraTools = extraTools;
    this.cachedLeanTools = leanTools;
    this.cachedMcpTools = mcpTools;
    this.cachedMcpDiscoveryTools = mcpDiscoveryTools;
    this.cachedSubagents = subagents;
    const initialTools = this.selectContextTools([]);
    const initialSubagents = this.selectContextSubagents('', []);
    this.cachedAgentToolKey = this.getToolKey(initialTools);
    this.cachedAgentSubagentKey = this.getSubagentKey(initialSubagents);

    this.agent = await this.createAgentInstance({
      systemPrompt,
      tools: initialTools,
      subagents: initialSubagents,
    });

    return {
      projectPath,
      hasContext: this.projectContext.hasContext(),
      agentCount: subagents.length,
      toolCount: allTools.length + mcpTools.length,
    };
  }

  async reinitializeModel(): Promise<void> {
    this.model = this.llmClientFactory.create('default');
    await this.refreshEnvironmentPrompt();
    this.cachedBasePrompt = this.buildBasePrompt(this.cachedExtraTools, this.cachedSubagents);
    this.cachedSystemPrompt = this.cachedBasePrompt;
    this.cachedLeanSystemPrompt = '';
    this.leanAgent = null;
    const initialTools = this.selectContextTools([]);
    const initialSubagents = this.selectContextSubagents('', []);
    this.cachedAgentToolKey = this.getToolKey(initialTools);
    this.cachedAgentSubagentKey = this.getSubagentKey(initialSubagents);
    this.agent = await this.createAgentInstance({
      systemPrompt: this.cachedSystemPrompt,
      tools: initialTools,
      subagents: initialSubagents,
    });
  }

  async refreshEnvironmentContext(): Promise<void> {
    await this.refreshEnvironmentPrompt();

    const allTools = this.toolsRegistry.getAllTools();
    const mcpTools = this.mcpRegistry.getAllMcpTools();
    this.cachedBuiltinTools = allTools.filter(t => DEEPAGENT_BUILTIN_TOOLS.has(t.name));
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
    this.model = this.model ?? this.llmClientFactory.create('default');
    this.agent = await this.createAgentInstance({
      systemPrompt: this.cachedSystemPrompt,
      tools: initialTools,
      subagents: initialSubagents,
    });
  }

  private async createAgentInstance(input: {
    systemPrompt: string;
    tools: any[];
    subagents: any[];
  }): Promise<any> {
    return new CastAgentEngine({
      client: this.model ?? this.llmClientFactory.create('default'),
      systemPrompt: input.systemPrompt,
      tools: this.dedupeTools([...input.tools, this.getCodeInterpreterTool()]),
      subagents: input.subagents,
    });
  }

  private async buildDeepAgentMiddleware(): Promise<any[]> {
    return [
      {
        name: 'CodeInterpreterMiddleware',
        tools: [this.getCodeInterpreterTool()],
      },
    ];
  }

  private getCodeInterpreterTool(): CastTool {
    if (!this.codeInterpreterTool) {
      this.codeInterpreterTool = castTool(
        async ({ code }) => this.runQuickJsSnippet(code),
        {
          name: 'eval',
          description: 'Run JavaScript in a sandboxed REPL for quick calculations and transformations.',
          schema: z.object({ code: z.string().min(1) }),
        },
      );
    }

    return this.codeInterpreterTool;
  }

  private async runQuickJsSnippet(code: string): Promise<string> {
    const quickjs = await getQuickJS();
    const vm = quickjs.newContext();
    try {
      const result = vm.evalCode(code);
      if (result.error) {
        const dumped = vm.dump(result.error);
        result.error.dispose();
        return `Error: ${String(dumped)}`;
      }

      const dumped = vm.dump(result.value);
      result.value.dispose();
      return typeof dumped === 'string' ? dumped : JSON.stringify(dumped);
    } finally {
      vm.dispose();
    }
  }

  private dedupeTools(tools: CastTool[]): CastTool[] {
    const seen = new Set<string>();
    return tools.filter((tool) => {
      if (!tool?.name || seen.has(tool.name)) {
        return false;
      }
      seen.add(tool.name);
      return true;
    });
  }

  private getDeepAgentSkillSources(): string[] {
    return ['.cast/skills', '.skills']
      .filter((source) => existsSync(path.join(this.projectRoot, source)));
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
    const selected = [...this.cachedBuiltinTools, ...this.cachedExtraTools, ...this.cachedMcpDiscoveryTools];
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
      {
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
      },
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
      .filter((message: any) => message?.role === 'tool' || message?._getType?.() === 'tool')
      .map((message: any) => ({
        name: message.name || message.toolName || message.lc_kwargs?.name || '',
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

  private async *streamCompactChat(message: string): AsyncGenerator<ChatStreamChunk> {
    const activeModel = this.model ?? this.llmClientFactory.create('default');
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
        const stream = await (activeModel as any).stream(outboundMessages, {});
        for await (const chunk of stream) {
          const text = (chunk as any)?.type === 'text_delta'
            ? String((chunk as any).delta ?? '')
            : this.extractTextFromModelContent((chunk as any)?.content ?? chunk);
          if (text) {
            fullResponse += text;
            yield { kind: 'text', text };
          }

          if ((chunk as any)?.type === 'usage') {
            interactionInputTokens += (chunk as any).usage?.inputTokens ?? 0;
            interactionOutputTokens += (chunk as any).usage?.outputTokens ?? 0;
            interactionCachedInputTokens += (chunk as any).usage?.cachedInputTokens ?? 0;
            hasExactUsage = true;
          } else {
            const usage = this.extractUsage(chunk);
            if (usage.input > 0 || usage.output > 0) {
              interactionInputTokens += usage.input;
              interactionOutputTokens += usage.output;
              interactionCachedInputTokens += usage.cachedInput;
              hasExactUsage = true;
            }
          }
        }
      } else {
        const response = await activeModel.invoke(outboundMessages as Message[]);
        const text = this.extractTextFromModelContent((response as any)?.content ?? response);
        if (text) {
          fullResponse += text;
          yield { kind: 'text', text };
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
      yield { kind: 'text', text: `\n\x1b[31m  Stream error: ${(error as Error).message}\x1b[0m\n` };
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
      const modelName = this.getModelName(activeModel);
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
      const role = this.getMessageType(m) === 'human' ? 'User' : 'Assistant';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
      return `${role}: ${truncated}`;
    }).join('\n');

    try {
      const summaryModel = this.llmClientFactory.create('cheap');
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
      ] as Message[]);

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
      const summaryModel = this.llmClientFactory.create('cheap');
      const response = await this.withTimeout(
        summaryModel.invoke([
          new SystemMessage([
            'You summarize a Cast Code CLI session for future local memory.',
            'Persist only durable context: decisions, user preferences, completed work, pending follow-ups, and relevant file/module names.',
            'Do not include raw secrets, API keys, long tool outputs, or full diffs.',
            'Keep it under 350 words. Output only the summary.',
          ].join('\n')),
          new HumanMessage(conversationText),
        ] as Message[]),
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
      const messageType = this.getMessageType(message);
      const role = messageType === 'human'
        ? 'User'
        : messageType === 'ai'
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

  private getMessageType(message: BaseMessage): string {
    const explicitType = message._getType?.();
    if (explicitType) {
      return explicitType;
    }
    if (message.role === 'user') return 'human';
    if (message.role === 'assistant') return 'ai';
    if (message.role === 'tool') return 'tool';
    return 'system';
  }

  private getModelName(model: unknown): string {
    const candidate = model as {
      getModelName?: () => string;
      modelName?: string;
      model?: string;
    } | null | undefined;
    if (!candidate) {
      return 'unknown';
    }
    return candidate.getModelName?.()
      || candidate.modelName
      || candidate.model
      || 'unknown';
  }

  private isDelegationTool(toolName?: string): boolean {
    return toolName === 'task';
  }

  private normalizeDelegatedTaskInput(input: any): any {
    let current = input;
    for (let i = 0; i < 4; i += 1) {
      if (typeof current === 'string') {
        const trimmed = current.trim();
        if (!trimmed) {
          return {};
        }
        try {
          current = JSON.parse(trimmed);
          continue;
        } catch {
          return { description: trimmed };
        }
      }

      if (!current || typeof current !== 'object') {
        return {};
      }

      if (
        current.subagent_type
        || current.subagentType
        || current.subagent
        || current.subagent_name
        || current.agent
        || current.name
        || current.description
        || current.task
        || current.prompt
      ) {
        return current;
      }

      if (current.input !== undefined) {
        current = current.input;
        continue;
      }
      if (current.args !== undefined) {
        current = current.args;
        continue;
      }
      if (current.arguments !== undefined) {
        current = current.arguments;
        continue;
      }

      return current;
    }

    return current && typeof current === 'object' ? current : {};
  }

  private getDelegatedAgentName(input: any): string {
    const normalized = this.normalizeDelegatedTaskInput(input);
    const value = normalized?.subagent_type
      || normalized?.subagentType
      || normalized?.subagent
      || normalized?.subagent_name
      || normalized?.agent
      || normalized?.name;
    const name = String(value || 'subagent').trim();
    return name || 'subagent';
  }

  private getDelegatedAgentTask(input: any): string {
    const normalized = this.normalizeDelegatedTaskInput(input);
    const value = normalized?.description || normalized?.task || normalized?.prompt;
    const task = String(value || 'Delegated sub-agent task').trim();
    return task || 'Delegated sub-agent task';
  }

  private startDelegatedAgentRun(input: any): AgentRun | undefined {
    if (!this.agentRunService) {
      return undefined;
    }

    const taskInput = this.normalizeDelegatedTaskInput(input);
    const agentName = this.getDelegatedAgentName(taskInput);
    const task = this.getDelegatedAgentTask(taskInput);
    const run = this.agentRunService.createRun({
      agentName,
      task,
      inputContract: {
        prompt: task,
        fileOwnership: [],
        toolScope: [],
        requiredSkills: [],
        expectedOutput: {
          kind: 'custom',
          requiredSections: ['Result'],
        },
        acceptanceCriteria: ['Return a focused sub-agent result to the main agent.'],
      },
    });
    this.agentRunService.startRun(run.id);
    return run;
  }

  private completeDelegatedAgentRun(runId: string | undefined, output: string): void {
    if (!runId || !this.agentRunService) {
      return;
    }

    this.agentRunService.completeRun(runId, [{
      kind: 'handoff',
      title: 'Sub-agent result',
      content: this.redactSensitiveText(this.truncateText(output || 'No output returned.', 4000)),
    }]);
  }

  private failDelegatedAgentRun(runId: string | undefined, error: unknown): void {
    if (!runId || !this.agentRunService) {
      return;
    }

    const message = error instanceof Error
      ? error.message
      : String((error as any)?.message || 'Unknown error');
    this.agentRunService.failRun(runId, {
      message: this.redactSensitiveText(this.truncateText(message, 1200)),
      recoverable: true,
    });
  }

  private extractPendingToolCall(toolCall: any): { name: string; input: any } | undefined {
    const rawName = toolCall?.name || toolCall?.function?.name || toolCall?.tool_name;
    if (!rawName) {
      return undefined;
    }

    const rawArgs = toolCall?.args
      ?? toolCall?.arguments
      ?? toolCall?.function?.arguments
      ?? toolCall?.input;

    if (typeof rawArgs === 'string') {
      const trimmed = rawArgs.trim();
      if (!trimmed) {
        return { name: String(rawName), input: {} };
      }
      try {
        return { name: String(rawName), input: JSON.parse(trimmed) };
      } catch {
        return undefined;
      }
    }

    return {
      name: String(rawName),
      input: rawArgs && typeof rawArgs === 'object' ? rawArgs : {},
    };
  }

  private getPendingToolCallsFromOutput(output: any): any[] {
    const candidates = [
      output?.tool_calls,
      output?.additional_kwargs?.tool_calls,
      output?.kwargs?.tool_calls,
      output?.kwargs?.additional_kwargs?.tool_calls,
      output?.lc_kwargs?.tool_calls,
      output?.lc_kwargs?.additional_kwargs?.tool_calls,
    ];

    return candidates.flatMap((toolCalls) => Array.isArray(toolCalls) ? toolCalls : []);
  }

  private redactSensitiveText(value: string): string {
    return value
      .replace(/\b(?:sk|csk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_KEY]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');
  }

  async *chat(message: string): AsyncGenerator<ChatStreamChunk> {
    const summarized = await this.autoSummarize();
    if (summarized) {
      yield {
        kind: 'text',
        text: `\n\x1b[2m  \u2500 conversation compacted (${this.messages.length} messages retained)\x1b[0m\n`,
      };
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
        const leanModel = this.model ?? this.llmClientFactory.create('default');
        this.model = leanModel;
        this.cachedLeanSystemPrompt = leanPrompt;
        this.leanAgent = new CastAgentEngine({
          client: leanModel,
          systemPrompt: leanPrompt,
          tools: this.cachedLeanTools,
          toolFilter: (history, tools) => this.selectLeanStepTools(history as BaseMessage[], tools),
          toolChoice: 'required',
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
        this.agent = await this.createAgentInstance({
          systemPrompt: contextualPrompt,
          tools: activeTools,
          subagents: activeSubagents,
        });
      }
      activeAgent = this.agent;
    }

    const currentUserMessage = new HumanMessage(message);
    this.messages.push(currentUserMessage);
    this.replayService.recordEntry({ role: 'user', content: message });
    this.lastToolOutputs = [];

    const effort = this.llmClientFactory.getCurrentEffortProfile();
    const streamPayload = { messages: useLeanAgent ? [currentUserMessage] : this.messages };
    const recursionLimit = Math.max(8, effort.maxToolCalls * 2);
    let stream: AsyncIterable<any>;
    try {
      stream = this.deepAgentEventAdapter
        ? this.deepAgentEventAdapter.stream({
          agent: activeAgent,
          payload: streamPayload,
          recursionLimit,
          scope: { kind: 'main', runId: randomUUID() },
          streamVersion: this.getDeepAgentStreamVersion(),
          model: this.getModelName(this.model),
        })
        : activeAgent.streamEvents(
          streamPayload,
          { version: 'v2', recursionLimit },
        );
    } catch (error) {
      yield { kind: 'text', text: `\n\x1b[31m  Error starting agent: ${(error as Error).message}\x1b[0m\n` };
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
    const activeDelegatedAgentRuns = new Map<string, { runId: string; agentName: string; task: string; startedAt: number }>();
    let localToolSequence = 0;
    let lastLocalToolKey = '';

    try {
      for await (const streamItem of stream) {
        const envelope = this.asDeepAgentRuntimeEnvelope(streamItem);
        if (envelope) {
          this.trackRuntimeEvent(envelope.runtimeEvent);
        }

        if (envelope && !envelope.rawEvent) {
          const runtimeEvent = envelope.runtimeEvent;
          if (runtimeEvent.type === 'runtime.message.delta') {
            const text = this.extractTextFromModelContent(runtimeEvent.text);
            if (text) {
              if (useLeanAgent) {
                leanResponseBuffer += text;
              } else {
                yield { kind: 'text', text };
                fullResponse += text;
              }
            }
          }

          if (runtimeEvent.type === 'runtime.tool.started') {
            lastToolName = runtimeEvent.toolName;
            lastLocalToolKey = runtimeEvent.callId ?? `${runtimeEvent.toolName}:${++localToolSequence}`;
            activeLocalToolCalls.set(lastLocalToolKey, {
              name: runtimeEvent.toolName,
              input: runtimeEvent.input,
              startedAt: Date.now(),
            });
            if (this.isDelegationTool(runtimeEvent.toolName)) {
              const run = this.startDelegatedAgentRun(runtimeEvent.input);
              const agentName = this.getDelegatedAgentName(runtimeEvent.input);
              const task = this.getDelegatedAgentTask(runtimeEvent.input);
              const agentId = run?.id ?? lastLocalToolKey;
              activeDelegatedAgentRuns.set(lastLocalToolKey, {
                runId: agentId,
                agentName,
                task,
                startedAt: Date.now(),
              });
              yield {
                kind: 'agent',
                event: { type: 'spawned', agentId, agentName, task },
              };
            }
            if (!this.isDelegationTool(runtimeEvent.toolName)) {
              yield {
                kind: 'tool',
                event: {
                  type: 'started',
                  toolName: runtimeEvent.toolName,
                  callId: runtimeEvent.callId,
                  input: runtimeEvent.input,
                },
              };
            }
          }

          if (runtimeEvent.type === 'runtime.tool.completed') {
            const localToolKey = runtimeEvent.callId ?? lastLocalToolKey;
            const localTool = activeLocalToolCalls.get(localToolKey) ?? {
              name: runtimeEvent.toolName || lastToolName,
              input: undefined,
              startedAt: Date.now(),
            };
            const toolName = localTool.name || runtimeEvent.toolName || lastToolName || 'tool';
            const output = this.extractToolOutputText(runtimeEvent.outputPreview || runtimeEvent.summary || '');
            if (output) {
              this.lastToolOutputs.push({ tool: toolName, output });
            }
            if (!this.isDelegationTool(toolName)) {
              yield {
                kind: 'tool',
                event: {
                  type: 'completed',
                  toolName,
                  callId: runtimeEvent.callId ?? localToolKey,
                  output,
                  durationMs: runtimeEvent.durationMs ?? Math.max(0, Date.now() - localTool.startedAt),
                },
              };
            }
            activeLocalToolCalls.delete(localToolKey);
            if (this.isDelegationTool(toolName)) {
              const delegated = activeDelegatedAgentRuns.get(localToolKey);
              this.completeDelegatedAgentRun(delegated?.runId, output);
              activeDelegatedAgentRuns.delete(localToolKey);
              if (delegated) {
                yield {
                  kind: 'agent',
                  event: {
                    type: 'completed',
                    agentId: delegated.runId,
                    durationMs: Date.now() - delegated.startedAt,
                    summary: output ? output.split('\n')[0].slice(0, 120) : undefined,
                  },
                };
              }
            }
            this.recordLocalToolCall({
              toolName,
              inputRedacted: this.serializeForLocalState(localTool.input),
              outputPreview: output,
              status: 'ok',
              latencyMs: runtimeEvent.durationMs ?? Math.max(0, Date.now() - localTool.startedAt),
            });
          }

          if (runtimeEvent.type === 'runtime.tool.failed') {
            const localToolKey = runtimeEvent.callId ?? lastLocalToolKey;
            const localTool = activeLocalToolCalls.get(localToolKey) ?? {
              name: runtimeEvent.toolName || lastToolName,
              input: undefined,
              startedAt: Date.now(),
            };
            const toolName = localTool.name || runtimeEvent.toolName || lastToolName || 'tool';
            const message = runtimeEvent.message || 'Unknown error';
            activeLocalToolCalls.delete(localToolKey);
            if (this.isDelegationTool(toolName)) {
              const delegated = activeDelegatedAgentRuns.get(localToolKey);
              this.failDelegatedAgentRun(delegated?.runId, new Error(message));
              activeDelegatedAgentRuns.delete(localToolKey);
              if (delegated) {
                yield {
                  kind: 'agent',
                  event: {
                    type: 'failed',
                    agentId: delegated.runId,
                    durationMs: Date.now() - delegated.startedAt,
                    error: message,
                  },
                };
              }
            }
            this.recordLocalToolCall({
              toolName,
              inputRedacted: this.serializeForLocalState(localTool.input),
              outputPreview: message,
              status: 'error',
              latencyMs: runtimeEvent.durationMs ?? Math.max(0, Date.now() - localTool.startedAt),
            });
            if (!this.isDelegationTool(toolName)) {
              yield {
                kind: 'tool',
                event: {
                  type: 'failed',
                  toolName,
                  callId: runtimeEvent.callId ?? localToolKey,
                  message,
                  durationMs: runtimeEvent.durationMs ?? Math.max(0, Date.now() - localTool.startedAt),
                },
              };
            }
          }

          if (runtimeEvent.type === 'runtime.usage') {
            interactionInputTokens += runtimeEvent.input ?? 0;
            interactionOutputTokens += runtimeEvent.output ?? 0;
            interactionCachedInputTokens += runtimeEvent.cachedInput ?? 0;
          }

          continue;
        }

        const event = envelope?.rawEvent ?? streamItem;
        if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
          const text = this.extractTextFromModelContent(event.data.chunk.content);
          if (text) {
            if (useLeanAgent) {
              leanResponseBuffer += text;
            } else {
              yield { kind: 'text', text };
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
                yield { kind: 'text', text: fallbackText };
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
          for (const tc of this.getPendingToolCallsFromOutput(output)) {
            const pending = this.extractPendingToolCall(tc);
            if (pending) {
              pendingToolInputs.push(pending);
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
          if (this.isDelegationTool(event.name)) {
            const run = this.startDelegatedAgentRun(toolInput);
            const agentName = this.getDelegatedAgentName(toolInput);
            const task = this.getDelegatedAgentTask(toolInput);
            const agentId = run?.id ?? lastLocalToolKey;
            activeDelegatedAgentRuns.set(lastLocalToolKey, {
              runId: agentId,
              agentName,
              task,
              startedAt: Date.now(),
            });
            yield {
              kind: 'agent',
              event: { type: 'spawned', agentId, agentName, task },
            };
          }
          if (!this.isDelegationTool(event.name)) {
            yield {
              kind: 'tool',
              event: {
                type: 'started',
                toolName: event.name,
                callId: lastLocalToolKey,
                input: toolInput,
              },
            };
          }
        }

        if (event.event === 'on_tool_end') {
          const localToolKey = String(event.run_id ?? lastLocalToolKey);
          const localTool = activeLocalToolCalls.get(localToolKey) ?? {
            name: event.name || lastToolName,
            input: undefined,
            startedAt: Date.now(),
          };
          const toolName = localTool.name || event.name || lastToolName || 'tool';
          const raw = event.data?.output;
          const output = this.extractToolOutputText(raw);
          if (output) {
            this.lastToolOutputs.push({ tool: toolName, output });
          }
          if (!this.isDelegationTool(toolName)) {
            yield {
              kind: 'tool',
              event: {
                type: 'completed',
                toolName,
                callId: localToolKey,
                output,
                durationMs: Math.max(0, Date.now() - localTool.startedAt),
              },
            };
          }
          activeLocalToolCalls.delete(localToolKey);
          if (this.isDelegationTool(toolName)) {
            const delegated = activeDelegatedAgentRuns.get(localToolKey);
            this.completeDelegatedAgentRun(delegated?.runId, output);
            activeDelegatedAgentRuns.delete(localToolKey);
            if (delegated) {
              yield {
                kind: 'agent',
                event: {
                  type: 'completed',
                  agentId: delegated.runId,
                  durationMs: Date.now() - delegated.startedAt,
                  summary: output ? output.split('\n')[0].slice(0, 120) : undefined,
                },
              };
            }
          }
          this.recordLocalToolCall({
            toolName,
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
          const toolName = localTool.name || event.name || lastToolName || 'tool';
          activeLocalToolCalls.delete(localToolKey);
          if (this.isDelegationTool(toolName)) {
            const delegated = activeDelegatedAgentRuns.get(localToolKey);
            this.failDelegatedAgentRun(delegated?.runId, error);
            activeDelegatedAgentRuns.delete(localToolKey);
            if (delegated) {
              yield {
                kind: 'agent',
                event: {
                  type: 'failed',
                  agentId: delegated.runId,
                  durationMs: Date.now() - delegated.startedAt,
                  error: String((error as any)?.message ?? error),
                },
              };
            }
          }
          this.recordLocalToolCall({
            toolName,
            inputRedacted: this.serializeForLocalState(localTool.input),
            outputPreview: error?.message || 'Unknown error',
            status: 'error',
            latencyMs: Math.max(0, Date.now() - localTool.startedAt),
          });
          if (!this.isDelegationTool(toolName)) {
            yield {
              kind: 'tool',
              event: {
                type: 'failed',
                toolName,
                callId: localToolKey,
                message: error?.message || 'Unknown error',
                durationMs: Math.max(0, Date.now() - localTool.startedAt),
              },
            };
          }
        }
      }
    } catch (error) {
      const msg = (error as Error).message;
      if (!msg.includes('abort') && !msg.includes('cancel')) {
        yield { kind: 'text', text: `\n\x1b[31m  Stream error: ${msg}\x1b[0m\n` };
      }
    }

    if (useLeanAgent && leanResponseBuffer.trim()) {
      const finalResponse = this.sanitizeLeanFinalResponse(leanResponseBuffer, message);
      if (finalResponse) {
        yield { kind: 'text', text: finalResponse };
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
      const modelName = this.getModelName(this.model);
      this.statsService.trackUsage(modelName, interactionInputTokens, interactionOutputTokens, interactionCachedInputTokens);
    }
  }

  private asDeepAgentRuntimeEnvelope(value: any): DeepAgentRuntimeEnvelope | undefined {
    if (
      value
      && typeof value === 'object'
      && value.runtimeEvent
      && typeof value.runtimeEvent.type === 'string'
      && (value.sourceVersion === 'v2' || value.sourceVersion === 'v3')
    ) {
      return value as DeepAgentRuntimeEnvelope;
    }
    return undefined;
  }

  private trackRuntimeEvent(event: CastRuntimeEvent): void {
    const projected = this.runtimeTelemetryProjector?.project(event);
    if (projected) {
      this.platformService.track(projected.type, projected.payload);
    }
  }

  private getDeepAgentStreamVersion(): DeepAgentStreamVersion {
    const version = process.env.CAST_DEEPAGENTS_STREAM_VERSION;
    return version === 'v2' || version === 'v3' || version === 'auto' ? version : 'auto';
  }

  async runBenchmarkPrompt(prompt: string): Promise<{ output: string; tokens: number; cost: number }> {
    const before = this.getSessionTokenUsage();
    let output = '';
    for await (const chunk of this.chat(prompt)) {
      if (chunk.kind === 'text') {
        output += chunk.text;
      }
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

  private extractToolOutputText(output: unknown): string {
    if (output === undefined || output === null) {
      return '';
    }

    if (this.isRuntimeControlObject(output)) {
      return '';
    }

    if (typeof output === 'string') {
      return this.sanitizeTextForDisplay(output);
    }

    if (typeof output === 'object') {
      const record = output as Record<string, unknown>;
      if (record.content !== undefined) {
        return this.extractTextFromModelContent(record.content);
      }
      if (record.output !== undefined) {
        return this.extractTextFromModelContent(record.output);
      }
      try {
        return this.sanitizeTextForDisplay(JSON.stringify(output));
      } catch {
        return '';
      }
    }

    return this.sanitizeTextForDisplay(String(output));
  }

  clearHistory() {
    this.messages = [];
    this.tokenCount = 0;
    this.cumulativeInputTokens = 0;
    this.cumulativeOutputTokens = 0;
    this.cumulativeCachedInputTokens = 0;
  }

  /**
   * Replaces the in-memory conversation with a previously saved session.
   * Used by /resume. Tool results are restored as system notes since the
   * original tool_call linkage is not preserved in replay entries.
   */
  restoreConversation(entries: RestorableEntry[]): number {
    this.clearHistory();
    for (const entry of entries) {
      if (!entry.content) continue;
      if (entry.role === 'user') {
        this.messages.push(new HumanMessage(entry.content));
      } else if (entry.role === 'assistant') {
        this.messages.push(new AIMessage(entry.content));
      } else {
        this.messages.push(
          new SystemMessage(`[restored tool result: ${entry.toolName ?? 'unknown'}]\n${entry.content}`),
        );
      }
    }
    return this.messages.length;
  }

  private extractTextFromModelContent(content: unknown): string {
    if (!content) return '';

    if (typeof content === 'string') {
      return this.sanitizeTextForDisplay(content);
    }

    if (Array.isArray(content)) {
      let combined = '';
      for (const item of content) {
        combined += this.extractTextFromModelContent(item);
      }
      return combined;
    }

    if (typeof content === 'object') {
      if (this.isRuntimeControlObject(content)) {
        return '';
      }

      const record = content as Record<string, unknown>;

      if (typeof record.text === 'string') {
        return this.sanitizeTextForDisplay(record.text);
      }

      if (typeof record.content === 'string') {
        return this.sanitizeTextForDisplay(record.content);
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

  private sanitizeTextForDisplay(value: string): string {
    if (!value || this.isRuntimeControlText(value)) {
      return '';
    }
    return value;
  }

  private isRuntimeControlText(value: string): boolean {
    const text = value.trim();
    if (!text) {
      return false;
    }

    return /"lg_name"\s*:|"lc_kwargs"\s*:|"langchain_core"\s*:|\blangchain_core\b|"\$type"\s*:\s*"Command"|^\s*\{[\s\S]{0,300}"constructor"\s*:[\s\S]{0,300}"Command"/i.test(text);
  }

  private isRuntimeControlObject(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.isRuntimeControlObject(item));
    }

    const record = value as Record<string, unknown>;
    const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(record, key);
    if (
      hasOwn('lg_name')
      || hasOwn('lc_kwargs')
      || hasOwn('langchain_core')
      || (hasOwn('constructor') && String((record.constructor as any)?.name || record.constructor).includes('Command'))
    ) {
      return true;
    }

    const typeHints = [
      record.type,
      record.name,
      record.id,
      record.lc_namespace,
    ];
    return typeHints.some((hint) => Array.isArray(hint)
      ? hint.some((part) => String(part).includes('langchain_core'))
      : /^(Command|langchain_core)$/i.test(String(hint || '')));
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
        if (chunk.kind !== 'text') {
          continue;
        }
        fullResponse += chunk.text;
        process.stdout.write(chunk.text);
      }

      return { success: true, output: fullResponse.trim() };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    } finally {
      this.permissionService.setHeadless(false);
    }
  }
}
