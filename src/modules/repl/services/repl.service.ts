import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DeepAgentService } from '../../core/services/deep-agent.service';
import { ConfigService } from '../../../common/services/config.service';
import { ConfigManagerService } from '../../config/services/config-manager.service';
import { ProviderType } from '../../config/types/config.types';
import { getModelContextUsage } from '../../config/utils/model-context';
import { MentionsService } from '../../mentions/services/mentions.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { PlanModeService } from '../../core/services/plan-mode.service';
import { SmartInput, type Suggestion } from './smart-input';
import { LiveRegionCompositor } from '../../../ui/live-region/compositor';
import { AgentTreeBlock } from '../../../ui/live-region/agent-tree-block';
import { detectKittyProtocol, KITTY_ENABLE, KITTY_DISABLE, MODIFY_OTHER_KEYS_ENABLE, MODIFY_OTHER_KEYS_DISABLE } from '../../../ui/live-region/kitty-protocol';
import { getToolInputSummary, getToolDisplayName } from '../../../ui/cast-design/tool-call-details';
import { WelcomeScreenService } from './welcome-screen.service';
import { ReplCommandsService } from './commands/repl-commands.service';
import { GitCommandsService } from './commands/git-commands.service';
import { AgentCommandsService } from './commands/agent-commands.service';
import { McpCommandsService } from './commands/mcp-commands.service';
import { ConfigCommandsService } from '../../config/services/config-commands.service';
import { ProjectCommandsService } from './commands/project-commands.service';
import { SnapshotCommandsService } from './commands/snapshot-commands.service';
import { StatsCommandsService } from './commands/stats-commands.service';
import { ResumeCommandsService } from './commands/resume-commands.service';
import { SessionsCommandsService } from './commands/session-commands.service';
import { VaultCommandsService } from './commands/vault-commands.service';
import { PlatformCommandsService } from './commands/platform-commands.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { FilesystemToolsService } from '../../tools/services/filesystem-tools.service';
import { DiscoveryToolsService } from '../../tools/services/discovery-tools.service';
import { KanbanServerService } from '../../kanban/services/kanban-server.service';
import { RemoteServerService } from '../../remote/services/remote-server.service';
import { PermissionService } from '../../permissions/services/permission.service';
import {
  DangerLevel,
  PermissionResponse,
  PermissionScope,
} from '../../permissions/types/permission.types';
import { Colors, Icons } from '../utils/theme';
import { PlatformService } from '../../platform/services/platform.service';
import { LocalSessionStoreService } from '../../state/services/local-session-store.service';
import { BenchmarkCommandsService } from '../../benchmark/commands/benchmark-commands.service';
import { EnvironmentCommandsService } from '../../environments/commands/environment-commands.service';
import { ScheduleCommandsService } from '../../scheduler/commands/schedule-commands.service';
import { SandboxCommandsService } from '../../sandbox/commands/sandbox-commands.service';
import { BridgeCommandsService } from '../../bridge/commands/bridge-commands.service';
import { SwarmCommandsService } from '../../swarm/commands/swarm-commands.service';
import { RuntimeTelemetryProjectorService } from '../../runtime/services/runtime-telemetry-projector.service';
import type { CastRuntimeEvent } from '../../runtime/types/runtime-event.types';
import { CommandUiService } from './command-ui.service';
import { ToolUiService } from './tool-ui.service';
import type { ChatStreamChunk } from '../../../ui/cast-design/tool-call.types';
import { stripAnsi, visibleWidth } from '../../../ui/cast-design/cli-renderer';

type CastReference = {
  type: 'agent' | 'skill';
  name: string;
  label: string;
  source: 'builtin' | 'local' | 'project' | 'remote' | 'platform' | 'unknown';
  version?: string;
  content: string;
};

type ReplInputMode = 'request-always' | 'accept-edits' | 'plan';

@Injectable()
export class ReplService {
  private readonly ui = new CommandUiService();
  private toolUi: ToolUiService | null = null;
  private smartInput: SmartInput | null = null;
  private compositor!: LiveRegionCompositor;
  private agentTree!: AgentTreeBlock;
  private kittySupported = false;
  private abortController: AbortController | null = null;
  private pendingLines: string[] = [];
  private isProcessing = false;
  private isBroadcasting = false;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private spinnerFrameIndex = 0;
  private spinnerLabel = '';
  private inputMode: ReplInputMode = 'request-always';
  private localSessionId: string | null = null;
  private localStateWarningShown = false;

  constructor(
    private readonly deepAgent: DeepAgentService,
    private readonly configService: ConfigService,
    private readonly configManager: ConfigManagerService,
    private readonly mentionsService: MentionsService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly welcomeScreen: WelcomeScreenService,
    private readonly planMode: PlanModeService,
    private readonly replCommands: ReplCommandsService,
    private readonly gitCommands: GitCommandsService,
    private readonly agentCommands: AgentCommandsService,
    private readonly mcpCommands: McpCommandsService,
    private readonly configCommands: ConfigCommandsService,
    private readonly projectCommands: ProjectCommandsService,
    private readonly snapshotCommandsService: SnapshotCommandsService,
    private readonly statsCommandsService: StatsCommandsService,
    private readonly resumeCommandsService: ResumeCommandsService,
    private readonly vaultCommandsService: VaultCommandsService,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly kanbanServer: KanbanServerService,
    private readonly remoteServer: RemoteServerService,
    private readonly permissionService: PermissionService,
    private readonly filesystemTools: FilesystemToolsService,
    private readonly platformService: PlatformService,
    private readonly platformCommands: PlatformCommandsService,
    @Optional()
    private readonly benchmarkCommands?: BenchmarkCommandsService,
    private readonly discoveryTools?: DiscoveryToolsService,
    @Optional()
    private readonly localSessionStore?: LocalSessionStoreService,
    @Optional()
    private readonly environmentCommands?: EnvironmentCommandsService,
    @Optional()
    private readonly scheduleCommands?: ScheduleCommandsService,
    @Optional()
    private readonly sandboxCommands?: SandboxCommandsService,
    @Optional()
    private readonly sessionsCommands?: SessionsCommandsService,
    @Optional()
    private readonly bridgeCommands?: BridgeCommandsService,
    @Optional()
    private readonly swarmCommands?: SwarmCommandsService,
    @Optional()
    private readonly runtimeTelemetryProjector?: RuntimeTelemetryProjectorService,
  ) {
    this.benchmarkCommands?.setAgentExecutor?.(this.deepAgent as any);
    this.environmentCommands?.setAgentRefresh?.(this.deepAgent as any);
    this.scheduleCommands?.setAgentExecutor?.(this.deepAgent as any);
  }

  async start(): Promise<void> {
    const initResult = await this.deepAgent.initialize();
    await this.startLocalStateSession(initResult);
    const agentCount = this.agentRegistry.resolveAllAgents().length;

    this.statsCommandsService.setDefaultModel(this.getModelDisplayName());

    this.welcomeScreen.printWelcomeScreen({
      projectPath: initResult.projectPath || undefined,
      model: this.getModelDisplayName(),
      toolCount: initResult.toolCount,
      agentCount,
    });

    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: Uint8Array | string, encoding?: BufferEncoding | ((err?: Error) => void), cb?: (err?: Error) => void): boolean => {
      if (this.isBroadcasting) {
        try {
          if (typeof chunk === 'string') {
            this.remoteServer.broadcast(chunk);
          } else if (Buffer.isBuffer(chunk)) {
            this.remoteServer.broadcast(chunk.toString());
          } else if (chunk instanceof Uint8Array) {
            this.remoteServer.broadcast(Buffer.from(chunk).toString());
          }
        } catch { /* never let broadcast errors affect the local terminal */ }
      }
      return originalWrite(chunk, encoding as any, cb as any);
    };

    this.remoteServer.onMessage(async (msg) => {
      this.writeInline(`${Colors.cyan}›${Colors.reset} ${msg}\r\n`);
      await this.handleLine(msg);
    });

    this.toolUi = this.createToolUi();
    const compositor = new LiveRegionCompositor({
      write: (s: string) => process.stdout.write(s),
      get columns() { return process.stdout.columns || 80; },
      get isTTY() { return Boolean(process.stdout.isTTY); },
    });
    this.compositor = compositor;
    this.agentTree = new AgentTreeBlock((content) => this.compositor.scrollOut(content));
    this.compositor.addBlock(this.agentTree, 0);
    this.compositor.onTick(() => this.agentTree.tick());
    this.smartInput = new SmartInput({
      compositor,
      getCommandSuggestions: (input) => this.getCommandSuggestions(input),
      getMentionSuggestions: (partial) => this.getMentionSuggestions(partial),
      getReferenceSuggestions: (partial) => this.getReferenceSuggestions(partial),
      getFooterLines: () => this.getInputFooterLines(),
      placeholder: 'Ask Cast anything...',
      onSubmit: (line) => this.handleLine(line),
      onCancel: () => this.handleCancel(),
      onExit: () => this.handleExit(),
      onCycleMode: () => this.cycleInputMode(),
      onExpandToolOutput: () => {
        if (this.getToolUi().expandLast()) {
          this.smartInput?.refresh();
        }
      },
    });

    this.permissionService.setPermissionHandler((command, dangerLevel) =>
      this.handlePermissionPrompt(command, dangerLevel),
    );

    this.filesystemTools.setFileWriteHandler((filePath, diffPreview, isNew) =>
      this.handleFileWritePrompt(filePath, diffPreview, isNew),
    );
    this.discoveryTools?.setCastCommandHandler((command) =>
      this.handleAgentCastCommand(command),
    );

    process.stdout.write(this.buildSeparatorLine() + '\r\n');
    await this.autostartBridgeIfConfigured();

    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
    this.kittySupported = await detectKittyProtocol({
      stdin: process.stdin,
      write: (s) => process.stdout.write(s),
      timeoutMs: 100,
    });
    if (this.kittySupported) {
      process.stdout.write(KITTY_ENABLE);
    } else if (process.stdin.isTTY) {
      // Fallback for VTE/xterm.js: disambiguate Shift+Enter via modifyOtherKeys.
      process.stdout.write(MODIFY_OTHER_KEYS_ENABLE);
    }

    const newlineHint = process.stdin.isTTY ? 'Shift+Enter newline' : 'Ctrl+J newline';
    this.smartInput.setFooterStatus({
      mode: this.getInputModeLabel(),
      model: this.getModelDisplayName(),
      hints: [newlineHint],
    });

    this.smartInput.start();
  }

  private buildSeparatorLine(): string {
    const width = process.stdout.columns || 80;
    const sepWidth = Math.max(24, Math.min(width - 4, 96));
    return `${Colors.subtle}${'─'.repeat(sepWidth)}${Colors.reset}`;
  }

  private async handlePermissionPrompt(
    command: string,
    dangerLevel: DangerLevel,
  ): Promise<PermissionResponse> {
    this.stopSpinner();
    this.smartInput?.pause();

    try {
      const isDangerous = dangerLevel === DangerLevel.DANGEROUS;
      const iconColor = isDangerous ? Colors.red : Colors.yellow;
      const cmd = command.length > 80 ? command.slice(0, 78) + '…' : command;

      process.stdout.write('\r\n');
      process.stdout.write(`  ${iconColor}${Icons.circle}${Colors.reset} ${Colors.dim}Shell${Colors.reset}  ${cmd}\r\n`);

      if (isDangerous) {
        process.stdout.write(`\r\n  ${Colors.red}⚠  Potentially dangerous — may cause irreversible changes${Colors.reset}\r\n`);
      }

      process.stdout.write('\r\n');

      const choices = [
        { key: 'allow-once', label: 'Yes', description: 'allow once' },
        { key: 'allow-session', label: 'Yes, don\'t ask again', description: 'for this session' },
        ...(!isDangerous ? [{ key: 'allow-always', label: 'Yes, always allow', description: 'save rule' }] : []),
        { key: 'deny', label: 'No', description: 'deny' },
      ] as const;

      const choice = await this.smartInput!.askChoice('Allow Cast to run this command?', [...choices]);

      switch (choice) {
      case 'allow-once':
        return { allowed: true, scope: PermissionScope.ONCE };
      case 'allow-session':
        return { allowed: true, scope: PermissionScope.SESSION };
      case 'allow-always':
        return { allowed: true, scope: PermissionScope.ALWAYS };
      case 'deny':
      default:
        return { allowed: false, scope: PermissionScope.ONCE };
      }
    } finally {
      this.smartInput?.resume();
    }
  }

  private async handleFileWritePrompt(filePath: string, diffPreview: string, isNew: boolean): Promise<boolean> {
    if (this.inputMode === 'accept-edits') {
      return true;
    }

    this.stopSpinner();
    this.smartInput?.pause();

    try {
      const rel = filePath.startsWith(process.cwd())
        ? filePath.slice(process.cwd().length + 1)
        : filePath;

      process.stdout.write('\r\n');
      process.stdout.write(`  ${Colors.cyan}${Icons.circle}${Colors.reset} ${Colors.dim}${isNew ? 'Create' : 'Write'}${Colors.reset}  ${Colors.cyan}${rel}${Colors.reset}\r\n`);

      if (!isNew && diffPreview) {
        const lines = diffPreview.split('\n');
        const visible = lines.slice(0, 20);
        process.stdout.write('\r\n');
        for (const line of visible) {
          if (line.startsWith('+')) {
            process.stdout.write(`  ${Colors.green}${line}${Colors.reset}\r\n`);
          } else if (line.startsWith('-')) {
            process.stdout.write(`  ${Colors.red}${line}${Colors.reset}\r\n`);
          } else {
            process.stdout.write(`  ${Colors.dim}${line}${Colors.reset}\r\n`);
          }
        }
        if (lines.length > 20) {
          process.stdout.write(`  ${Colors.dim}… ${lines.length - 20} more lines${Colors.reset}\r\n`);
        }
      }

      process.stdout.write('\r\n');

      const choices = [
        { key: 'yes', label: 'Yes', description: 'apply change' },
        { key: 'session', label: 'Yes, allow all', description: 'don\'t ask again this session' },
        { key: 'no', label: 'No', description: 'skip' },
      ] as const;

      const choice = await this.smartInput!.askChoice('Apply this change?', [...choices]);

      if (choice === 'session') {
        this.filesystemTools.setFileWriteHandler(() => Promise.resolve(true));
      }

      return choice === 'yes' || choice === 'session';
    } finally {
      this.smartInput?.resume();
    }
  }

  private async handleAgentCastCommand(command: string): Promise<string> {
    const normalized = command.trim();

    if (!normalized.startsWith('/') || /[\r\n]/.test(normalized)) {
      return 'Cast command rejected: expected one slash command, such as /status.';
    }

    if (/^\/(?:exit|quit)\b/i.test(normalized)) {
      return 'Cast command rejected: /exit and /quit must be run directly by the user.';
    }

    if (!this.smartInput) {
      return 'Cast command rejected: interactive input is not available.';
    }

    const shouldResumePrompt = !this.isProcessing;
    this.stopSpinner();
    this.smartInput.pause();

    try {
      process.stdout.write('\r\n');
      process.stdout.write(`  ${Colors.cyan}${Icons.circle}${Colors.reset} ${Colors.bold}Cast command${Colors.reset}  ${Colors.cyan}${normalized}${Colors.reset}\r\n`);
      process.stdout.write(`    ${Colors.subtle}Action${Colors.reset}    ${this.describeCastCommand(normalized)}\r\n`);
      process.stdout.write(`    ${Colors.subtle}Approval${Colors.reset}  ${Colors.warning}required${Colors.reset} ${Colors.subtle}(y/n or arrows)${Colors.reset}\r\n`);

      const choice = await this.smartInput.askChoice('Run this Cast command?', [
        { key: 'y', label: 'Yes', description: 'run command' },
        { key: 'n', label: 'No', description: 'deny' },
      ]);

      if (choice !== 'y') {
        process.stdout.write(`  ${Colors.warning}! Cast command denied: ${normalized}${Colors.reset}\r\n`);
        return `Cast command denied by user: ${normalized}`;
      }

      process.stdout.write(`  ${Colors.cyan}Running${Colors.reset} ${Colors.cyan}${normalized}${Colors.reset}\r\n`);
      const output = await this.captureVisibleOutput(() => this.handleCommand(normalized));
      return [
        `Cast command finished: ${normalized}`,
        '',
        'Output:',
        output || '(no visible output)',
      ].join('\n');
    } finally {
      if (shouldResumePrompt) {
        this.smartInput?.resume();
      }
    }
  }

  private describeCastCommand(command: string): string {
    const cmd = command.slice(1).split(/\s+/)[0].toLowerCase();
    const descriptions: Record<string, string> = {
      status: 'Show current git status',
      diff: 'Show git diff',
      log: 'Show recent commits',
      up: 'Commit and push current changes',
      'split-up': 'Split changes into multiple commits',
      pr: 'Create or prepare a pull request',
      review: 'Run code review',
      fix: 'Auto-fix a target file',
      ident: 'Format project files',
      release: 'Generate release notes',
      agents: 'List or manage Cast agents',
      skills: 'List or manage Cast skills',
      tools: 'List available tools',
      platform: 'Configure Cast Platform',
      bridge: 'Run Cast through an authenticated provider CLI',
      benchmark: 'Run local Benchmark Lab commands',
      env: 'List, activate, or inspect Cast environments',
      schedule: 'Manage local scheduled benchmark and environment jobs',
      swarm: 'Plan and run multi-agent Agent Swarm work',
      sandbox: 'Manage sandbox checkpoints and rollbacks',
    };
    return descriptions[cmd] || 'Run an existing Cast slash command';
  }

  private async captureVisibleOutput(action: () => Promise<void>): Promise<string> {
    const previousWrite = process.stdout.write;
    let captured = '';
    let started = false;

    process.stdout.write = ((chunk: string | Uint8Array, encoding?: BufferEncoding | ((err?: Error) => void), cb?: (err?: Error) => void): boolean => {
      const callback = typeof encoding === 'function' ? encoding : cb;
      const writeEncoding = typeof encoding === 'string' ? encoding : undefined;
      let visibleChunk = '';

      if (typeof chunk === 'string') {
        visibleChunk = chunk;
      } else if (Buffer.isBuffer(chunk)) {
        visibleChunk = chunk.toString();
      } else if (chunk instanceof Uint8Array) {
        visibleChunk = Buffer.from(chunk).toString();
      }

      if (!started) {
        visibleChunk = visibleChunk.replace(/^[\r\n]+/, '');
        started = visibleChunk.length > 0;
      }

      if (!visibleChunk) {
        callback?.();
        return true;
      }

      captured += visibleChunk;
      return writeEncoding
        ? previousWrite.call(process.stdout, visibleChunk, writeEncoding, callback as any)
        : previousWrite.call(process.stdout, visibleChunk, callback as any);
    }) as typeof process.stdout.write;

    try {
      await action();
    } finally {
      process.stdout.write = previousWrite;
    }

    return stripAnsi(captured)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();
  }

  private getCommandSuggestions(input: string): Array<{ text: string; display: string; description: string }> {
    const commands = [
      { text: '/help', display: '/help', description: 'Show help' },
      { text: '/clear', display: '/clear', description: 'Clear conversation' },
      { text: '/compact', display: '/compact', description: 'Compact history' },
      { text: '/exit', display: '/exit', description: 'Exit' },
      { text: '/status', display: '/status', description: 'Git status' },
      { text: '/diff', display: '/diff', description: 'Git diff' },
      { text: '/log', display: '/log', description: 'Git log' },
      { text: '/commit', display: '/commit', description: 'Commit changes' },
      { text: '/up', display: '/up', description: 'Smart commit & push' },
      { text: '/split-up', display: '/split-up', description: 'Split commits' },
      { text: '/pr', display: '/pr', description: 'Create Pull Request' },
      { text: '/unit-test', display: '/unit-test', description: 'Generate unit tests' },
      { text: '/review', display: '/review', description: 'Code review' },
      { text: '/fix', display: '/fix', description: 'Auto-fix code' },
      { text: '/ident', display: '/ident', description: 'Format code' },
      { text: '/release', display: '/release', description: 'Release notes' },
      { text: '/tools', display: '/tools', description: 'List tools' },
      { text: '/agents', display: '/agents', description: 'List agents' },
      { text: '/skills', display: '/skills', description: 'List skills' },
      { text: '/context', display: '/context', description: 'Session info' },
      { text: '/mentions', display: '/mentions', description: 'Mentions help' },
      { text: '/effort', display: '/effort', description: 'Set runtime budget' },
      { text: '/model', display: '/model', description: 'Show model' },
      { text: '/config', display: '/config', description: 'Configuration' },
      { text: '/platform', display: '/platform', description: 'Configure Cast Platform' },
      { text: '/project', display: '/project', description: 'Project context' },
      { text: '/project-deep', display: '/project-deep', description: 'Deep project analysis' },
      { text: '/init', display: '/init', description: 'Analyze project and generate context' },
      { text: '/mcp', display: '/mcp', description: 'MCP servers' },
      { text: '/kanban', display: '/kanban', description: 'Open kanban board' },
      { text: '/remote', display: '/remote', description: 'Start remote web interface via ngrok' },
      { text: '/rollback', display: '/rollback', description: 'Rollback file to previous snapshot' },
      { text: '/stats', display: '/stats', description: 'Show session usage stats' },
      { text: '/sessions', display: '/sessions', description: 'Search local sessions' },
      { text: '/resume', display: '/resume', description: 'Resume a saved session (interactive picker)' },
      { text: '/vault', display: '/vault', description: 'Manage code snippet vault' },
      { text: '/benchmark', display: '/benchmark', description: 'Local Benchmark Lab' },
      { text: '/env', display: '/env', description: 'Cast environments' },
      { text: '/schedule', display: '/schedule', description: 'Local schedulers' },
      { text: '/swarm', display: '/swarm', description: 'Agent Swarm plans' },
      { text: '/swarm plan', display: '/swarm plan', description: 'Generate swarm plan' },
      { text: '/swarm run', display: '/swarm run', description: 'Execute swarm run' },
      { text: '/swarm run --dry-run', display: '/swarm run --dry-run', description: 'Dry-run swarm workers' },
      { text: '/swarm integrate', display: '/swarm integrate', description: 'Integrate swarm patches' },
      { text: '/sandbox', display: '/sandbox', description: 'Sandbox checkpoints' },
      { text: '/bridge', display: '/bridge', description: 'Control provider bridge' },
    ];

    return commands.filter(c => c.text.startsWith(input));
  }

  private getReferenceSuggestions(partial: string): Suggestion[] {
    const query = partial.toLowerCase();
    const matches = (name: string) => query === '' || name.toLowerCase().startsWith(query);
    const describe = (type: 'agent' | 'skill', description?: string) =>
      description ? `${type} - ${description}` : type;

    const agents = this.agentRegistry.resolveAllAgents()
      .filter((agent) => matches(agent.name))
      .map((agent) => ({
        text: `$${agent.name}`,
        display: `$${agent.name}`,
        description: describe('agent', agent.description),
      }));

    const skills = (this.skillRegistry.getAllSkills?.() || [])
      .filter((skill) => matches(skill.name))
      .map((skill) => ({
        text: `$${skill.name}`,
        display: `$${skill.name}`,
        description: describe('skill', skill.description),
      }));

    return [...agents, ...skills];
  }

  private expandReferenceMentions(message: string): { expandedMessage: string; references: CastReference[] } {
    const references = this.resolveReferenceMentions(message);
    if (references.length === 0) {
      return { expandedMessage: message, references };
    }

    const context = [
      'The user referenced Cast agents or skills with $name. These references were injected automatically.',
      'Use the injected reference blocks as the source of truth for these names.',
      'When a referenced skill or agent is injected here, treat it as already loaded.',
      'If the user asks for an exact answer contained in an injected reference, answer directly.',
      'Do not call list_agents, read_skill, read_file, grep, glob, task, or other discovery tools just to resolve these $ references; only inspect files or call discovery tools if the user asks for details not present here.',
      '',
      '<cast_reference_policy resolved="true" discovery_needed="false">',
      '</cast_reference_policy>',
      '',
      '<cast_reference_manifest>',
      ...references.map((ref) => this.formatReferenceManifestLine(ref)),
      '</cast_reference_manifest>',
      '',
      ...references.map((ref) => ref.content),
    ].join('\n');

    return {
      expandedMessage: `${message}\n\n<cast_reference_context>\n${context}\n</cast_reference_context>`,
      references,
    };
  }

  private resolveReferenceMentions(message: string): CastReference[] {
    const names: string[] = [];
    const seenNames = new Set<string>();
    const pattern = /(?:^|[^\w])\$([\w.-]+)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(message)) !== null) {
      const name = match[1];
      const key = name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        names.push(name);
      }
    }

    if (names.length === 0) {
      return [];
    }

    const agents = new Map<string, any>();
    for (const agent of this.agentRegistry.resolveAllAgents()) {
      agents.set(agent.name.toLowerCase(), agent);
    }

    const skills = new Map<string, any>();
    for (const skill of this.skillRegistry.getAllSkills?.() || []) {
      skills.set(skill.name.toLowerCase(), skill);
    }

    const references: CastReference[] = [];
    const seenReferences = new Set<string>();

    for (const requestedName of names) {
      const key = requestedName.toLowerCase();
      const agent = agents.get(key);
      if (agent && !seenReferences.has(`agent:${agent.name}`)) {
        seenReferences.add(`agent:${agent.name}`);
        references.push({
          type: 'agent',
          name: agent.name,
          label: 'agent',
          source: this.normalizeReferenceSource(agent.source),
          version: this.hashReference({
            name: agent.name,
            description: agent.description,
            model: agent.model,
            tools: agent.tools?.map((tool: any) => tool?.name).filter(Boolean),
            mcp: agent.mcp,
            systemPrompt: agent.systemPrompt,
            source: agent.source,
            updatedAt: agent.updatedAt,
          }),
          content: this.formatAgentReference(agent),
        });
      }

      const skill = skills.get(key);
      if (skill && !seenReferences.has(`skill:${skill.name}`)) {
        seenReferences.add(`skill:${skill.name}`);
        references.push({
          type: 'skill',
          name: skill.name,
          label: 'skill',
          source: this.normalizeReferenceSource(skill.source),
          version: this.hashReference({
            name: skill.name,
            description: skill.description,
            tools: skill.tools,
            guidelines: skill.guidelines,
            source: skill.source,
            sourcePath: skill.sourcePath,
            updatedAt: skill.updatedAt,
          }),
          content: this.formatSkillReference(skill),
        });
      }
    }

    return references;
  }

  private formatAgentReference(agent: any): string {
    const tools = (agent.tools || [])
      .map((tool: any) => tool?.name)
      .filter(Boolean)
      .join(', ') || 'none';
    const mcp = Array.isArray(agent.mcp) && agent.mcp.length > 0 ? agent.mcp.join(', ') : 'none';
    const source = this.normalizeReferenceSource(agent.source);
    const version = this.hashReference({
      name: agent.name,
      description: agent.description,
      model: agent.model,
      tools: (agent.tools || []).map((tool: any) => tool?.name).filter(Boolean),
      mcp: agent.mcp,
      systemPrompt: agent.systemPrompt,
      source: agent.source,
      updatedAt: agent.updatedAt,
    });

    return [
      `<cast_reference type="agent" name="${this.escapeAttribute(agent.name)}" source="${source}" version="${version}">`,
      `Description: ${agent.description || 'No description'}`,
      `Model: ${agent.model || 'unknown'}`,
      `Tools: ${tools}`,
      `MCP: ${mcp}`,
      'System prompt:',
      this.truncateReferenceContent(agent.systemPrompt || '(none)'),
      '</cast_reference>',
    ].join('\n');
  }

  private formatSkillReference(skill: any): string {
    const tools = Array.isArray(skill.tools) && skill.tools.length > 0 ? skill.tools.join(', ') : 'none';
    const source = this.normalizeReferenceSource(skill.source);
    const version = this.hashReference({
      name: skill.name,
      description: skill.description,
      tools: skill.tools,
      guidelines: skill.guidelines,
      source: skill.source,
      sourcePath: skill.sourcePath,
      updatedAt: skill.updatedAt,
    });

    return [
      `<cast_reference type="skill" name="${this.escapeAttribute(skill.name)}" source="${source}" version="${version}">`,
      `Description: ${skill.description || 'No description'}`,
      `Tools: ${tools}`,
      'Guidelines:',
      this.truncateReferenceContent(skill.guidelines || '(none)'),
      '</cast_reference>',
    ].join('\n');
  }

  private formatReferenceManifestLine(ref: CastReference): string {
    const version = ref.version ? ` version=${ref.version}` : '';
    return `- ${ref.type} ${ref.name} source=${ref.source}${version} injected=true`;
  }

  private normalizeReferenceSource(source: unknown): CastReference['source'] {
    if (source === 'remote') return 'platform';
    if (source === 'builtin' || source === 'local') return source;
    if (source === 'project' || source === 'platform') return source;
    return 'unknown';
  }

  private hashReference(value: Record<string, unknown>): string {
    return createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex')
      .slice(0, 12);
  }

  private truncateReferenceContent(content: string): string {
    const max = 6000;
    if (content.length <= max) {
      return content;
    }
    return `${content.slice(0, max)}\n... (truncated ${content.length - max} chars)`;
  }

  private escapeAttribute(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private getMentionSuggestions(partial: string): Array<{ text: string; display: string; description: string }> {
    const gitOpts = [
      { text: '@git:status', display: '@git:status', description: 'Git status' },
      { text: '@git:diff', display: '@git:diff', description: 'Git diff' },
      { text: '@git:log', display: '@git:log', description: 'Git log' },
      { text: '@git:branch', display: '@git:branch', description: 'Branches' },
    ];

    if (partial === '') return [...gitOpts, ...this.getFileEntries('')];
    if (partial.startsWith('git:')) return gitOpts.filter(o => o.text.startsWith('@' + partial));

    return [...gitOpts.filter(o => o.text.startsWith('@' + partial)), ...this.getFileEntries(partial)].slice(0, 30);
  }

  private fileCache: string[] | null = null;
  private lastCacheTime = 0;

  private getCachedFiles(): string[] {
    const now = Date.now();
    if (this.fileCache && now - this.lastCacheTime < 5000) {
      return this.fileCache;
    }

    const fs = require('fs');
    const path = require('path');
    const ignore = ['node_modules', '.git', 'dist', 'coverage', '.next', '__pycache__'];

    const results: string[] = [];
    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (ignore.includes(e.name)) continue;
          if (e.name.startsWith('.') && e.name !== '.cast' && e.name !== '.claude') continue;
          const fullPath = path.join(dir, e.name);
          const relPath = path.relative(process.cwd(), fullPath);
          if (e.isDirectory()) {
            results.push(relPath + '/');
            walk(fullPath);
          } else {
            results.push(relPath);
          }
        }
      } catch { }
    };

    walk(process.cwd());
    this.fileCache = results;
    this.lastCacheTime = now;
    return results;
  }

  private getFileEntries(partial: string): Array<{ text: string; display: string; description: string }> {
    const fs = require('fs');
    const path = require('path');

    if (partial === '' || partial.includes('/') || partial.startsWith('.')) {
      try {
        let dir: string;
        let prefix: string;

        if (partial.endsWith('/')) {
          dir = partial.slice(0, -1) || '.';
          prefix = '';
        } else if (partial.includes('/')) {
          dir = path.dirname(partial);
          prefix = path.basename(partial);
        } else {
          dir = '.';
          prefix = partial;
        }

        const resolved = path.resolve(process.cwd(), dir);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return [];

        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const ignore = ['node_modules', '.git', 'dist', 'coverage', '.next', '__pycache__'];

        return entries
          .filter((e: any) => !ignore.includes(e.name))
          .filter((e: any) => !e.name.startsWith('.') || prefix.startsWith('.') || e.name === '.cast' || e.name === '.claude')
          .filter((e: any) => prefix === '' || e.name.toLowerCase().startsWith(prefix.toLowerCase()))
          .map((e: any) => {
            const relDir = dir === '.' ? '' : dir + '/';
            const isDir = e.isDirectory();
            return {
              text: '@' + relDir + e.name + (isDir ? '/' : ''),
              display: '@' + relDir + e.name + (isDir ? '/' : ''),
              description: isDir ? 'dir' : '',
            };
          })
          .slice(0, 20);
      } catch {
        return [];
      }
    } else {
      const allFiles = this.getCachedFiles();
      const lowerPartial = partial.toLowerCase();

      const matched = allFiles
        .filter(f => f.toLowerCase().includes(lowerPartial))
        .sort((a, b) => {
          const aName = path.basename(a).toLowerCase();
          const bName = path.basename(b).toLowerCase();
          const aStarts = aName.startsWith(lowerPartial);
          const bStarts = bName.startsWith(lowerPartial);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.length - b.length;
        });

      return matched.slice(0, 20).map(f => ({
        text: '@' + f,
        display: '@' + f,
        description: f.endsWith('/') ? 'dir' : 'file',
      }));
    }
  }

  private handleCancel(): void {
    if (this.isProcessing && this.abortController) {
      this.abortController.abort();
      this.stopSpinner();
      process.stdout.write(`\r\n  ${Colors.yellow}Interrupted${Colors.reset}\r\n\r\n`);
      this.isProcessing = false;
    } else {
      process.stdout.write(`  ${Colors.dim}Use /exit or Ctrl+D to quit${Colors.reset}\r\n`);
      this.smartInput?.showPrompt();
    }
  }

  private handleExit(): void {
    process.stdout.write(`\r\n  ${Colors.dim}Goodbye${Colors.reset}\r\n\r\n`);
    void this.shutdown().then(() => process.exit(0));
  }

  private async handleLine(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      this.smartInput?.refresh();
      return;
    }

    if (this.isProcessing) {
      this.pendingLines.push(trimmed);
      this.writeInline(
        `  ${Colors.magenta}↳${Colors.reset} ${Colors.dim}Queued${Colors.reset} ${Colors.subtle}(${this.pendingLines.length})${Colors.reset}\r\n`,
      );
      this.smartInput?.refresh();
      return;
    }

    this.runLine(trimmed);
    this.smartInput?.refresh();
  }

  private runLine(line: string): void {
    this.isProcessing = true;
    void this.processLine(line);
  }

  private async processLine(line: string): Promise<void> {
    this.isBroadcasting = true;
    try {
      if (line.startsWith('/')) {
        await this.handleCommand(line);
      } else if (await this.maybeOfferSwarm(line)) {
        return;
      } else if (this.bridgeCommands?.isConnected()) {
        await this.handleBridgePrompt(line);
      } else {
        await this.handleMessage(line);
      }
    } finally {
      this.isBroadcasting = false;
      this.isProcessing = false;
      this.startNextQueuedLine();
      this.smartInput?.refresh();
    }
  }

  private async maybeOfferSwarm(message: string): Promise<boolean> {
    if (!this.swarmCommands?.offerForPrompt) {
      return false;
    }

    try {
      return await this.swarmCommands.offerForPrompt(message, this.smartInput ?? undefined);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      process.stdout.write(this.ui.warning(`Agent Swarm suggestion skipped: ${msg}`));
      return false;
    }
  }

  private startNextQueuedLine(): void {
    if (this.isProcessing) {
      return;
    }

    const next = this.pendingLines.shift();
    if (next) {
      this.runLine(next);
    }
  }

  private writeInline(text: string): void {
    if (this.smartInput) {
      this.smartInput.printExternal(text);
      return;
    }
    process.stdout.write(text);
  }

  private createToolUi(): ToolUiService {
    return new ToolUiService({
      write: (text) => this.writeInline(text),
      rewrite: (lineCount, content) => {
        if (this.smartInput) {
          this.smartInput.rewriteLinesAbove(lineCount, content);
          return;
        }
        process.stdout.write(content);
      },
      getTerminalWidth: () => process.stdout.columns || 80,
    });
  }

  private getToolUi(): ToolUiService {
    if (!this.toolUi) {
      this.toolUi = this.createToolUi();
    }
    return this.toolUi;
  }

  private isMetaTextChunk(text: string): boolean {
    return text.includes('tokens:') || text.includes('conversation compacted');
  }

  private async handleCommand(command: string): Promise<void> {
    const parts = command.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    this.platformService.track('command.run', { command: `/${cmd}` });

    switch (cmd) {
    case 'help': this.replCommands.printHelp(); break;
    case 'clear': this.replCommands.cmdClear(this.welcomeScreen); break;
    case 'exit':
    case 'quit': this.handleExit(); return;
    case 'compact': await this.handleCompact(); break;
    case 'context': this.replCommands.cmdContext(); break;
    case 'effort': {
      const changed = await this.replCommands.cmdEffort(args, this.smartInput!);
      if (changed) {
        await this.configManager.loadConfig();
        await this.deepAgent.reinitializeModel();
        this.statsCommandsService.setDefaultModel(this.getModelDisplayName());
      }
      break;
    }
    case 'config':
      await this.configCommands.handleConfigCommand(args, this.smartInput!);
      await this.configManager.loadConfig();
      await this.deepAgent.reinitializeModel();
      break;
    case 'platform': {
      const configured = await this.platformCommands.cmdPlatform(args, this.smartInput!);
      if (configured) {
        await this.deepAgent.initialize();
      }
      break;
    }
    case 'link':
      process.stdout.write(this.ui.warning('/link foi removido. Use /platform para configurar a plataforma e vincular o projeto.'));
      break;
    case 'model': {
      const changed = await this.replCommands.cmdModel(args, this.smartInput!);
      if (changed) {
        await this.configManager.loadConfig();
        await this.deepAgent.reinitializeModel();
        this.statsCommandsService.setDefaultModel(this.getModelDisplayName());
      }
      break;
    }
    case 'init':
      await this.projectCommands.cmdProject(['analyze'], this.smartInput!);
      break;
    case 'mentions': this.replCommands.cmdMentionsHelp(); break;
    case 'tools': this.cmdTools(); break;

    case 'status': this.gitCommands.runGit('git status'); break;
    case 'diff': this.gitCommands.runGit(args.length ? `git diff ${args.join(' ')}` : 'git diff'); break;
    case 'log': this.gitCommands.runGit('git log --oneline -15'); break;
    case 'commit':
      process.stdout.write(`  ${Colors.dim}Use /up to commit and push, or /split-up to split into multiple commits.${Colors.reset}\r\n`);
      break;
    case 'up':
      await this.gitCommands.cmdUp(this.smartInput!);
      break;
    case 'split-up':
      await this.gitCommands.cmdSplitUp(this.smartInput!);
      break;
    case 'pr':
      await this.gitCommands.cmdPr(this.smartInput!);
      break;
    case 'unit-test':
      await this.gitCommands.cmdUnitTest(this.smartInput!);
      break;
    case 'review': await this.gitCommands.cmdReview(args); break;
    case 'fix': await this.gitCommands.cmdFix(args); break;
    case 'ident': await this.gitCommands.cmdIdent(); break;
    case 'release': await this.gitCommands.cmdRelease(args); break;

    case 'agents':
      await this.agentCommands.cmdAgents(args, this.smartInput!);
      break;
    case 'skills':
      await this.agentCommands.cmdSkills(args, this.smartInput!);
      break;

    case 'mcp':
      await this.mcpCommands.cmdMcp(args, this.smartInput!);
      break;

    case 'project':
      await this.projectCommands.cmdProject(args, this.smartInput!);
      break;
    case 'project-deep': {
      const deepResult = await this.projectCommands.cmdProject(['deep'], this.smartInput!);
      if (typeof deepResult === 'string') {
        return await this.handleMessage(deepResult);
      }
      break;
    }

    case 'kanban':
      {
        const result = await this.kanbanServer.start(!this.remoteServer.getIsRunning());
        if (!result.ok) {
          process.stdout.write(this.ui.error(`Kanban board failed to start: ${result.error}`));
          break;
        }

        const localUrl = result.url;
        const remoteUrl = this.remoteServer.getIsRunning() ? this.remoteServer.getPublicUrl() : null;
        if (remoteUrl) {
          process.stdout.write(`  Kanban board -> ${remoteUrl}/kanban\r\n`);
        } else {
          process.stdout.write(`  Kanban board -> ${localUrl}\r\n`);
        }
      }
      break;

    case 'remote':
      await this.remoteServer.start();
      break;

    case 'rollback':
      await this.snapshotCommandsService.cmdRollback(args.join(' '));
      break;
    case 'stats':
      this.statsCommandsService.cmdStats();
      break;
    case 'sessions':
      if (!this.sessionsCommands?.cmdSessions) {
        process.stdout.write(this.ui.error('Local session commands are not available in this runtime.'));
        break;
      }
      await this.sessionsCommands.cmdSessions(args);
      break;
    case 'resume':
      await this.resumeCommandsService.cmdResume(args, this.smartInput!);
      break;
    case 'vault':
      this.vaultCommandsService.cmdVault(args.join(' '));
      break;
    case 'benchmark': {
      const benchmarkCommands = this.benchmarkCommands;
      const runBenchmarkCommand = benchmarkCommands?.cmdBenchmark
        ? benchmarkCommands.cmdBenchmark.bind(benchmarkCommands)
        : (benchmarkCommands as any)?.handleBenchmarkCommand?.bind(benchmarkCommands);
      if (!runBenchmarkCommand) {
        process.stdout.write(this.ui.error('Benchmark Lab is not available in this runtime.'));
        break;
      }
      await runBenchmarkCommand(args, this.smartInput!);
      break;
    }
    case 'env':
      if (!this.environmentCommands?.cmdEnv) {
        process.stdout.write(this.ui.error('Cast environments are not available in this runtime.'));
        break;
      }
      await this.environmentCommands.cmdEnv(args);
      break;
    case 'schedule':
      if (!this.scheduleCommands?.cmdSchedule) {
        process.stdout.write(this.ui.error('Schedule automation is not available in this runtime.'));
        break;
      }
      await this.scheduleCommands.cmdSchedule(args, this.smartInput!);
      break;
    case 'sandbox':
      if (!this.sandboxCommands?.cmdSandbox) {
        process.stdout.write(this.ui.error('Sandbox checkpoints are not available in this runtime.'));
        break;
      }
      await this.sandboxCommands.cmdSandbox(args);
      break;
    case 'bridge': {
      if (!this.bridgeCommands?.cmdBridge) {
        process.stdout.write(this.ui.error('Bridge commands are not available in this runtime.'));
        break;
      }
      const bridgeOutput = await this.bridgeCommands.cmdBridge(args, process.cwd(), this.smartInput!);
      this.writeExternalBlock(bridgeOutput);
      break;
    }
    case 'swarm':
      if (!this.swarmCommands?.cmdSwarm) {
        process.stdout.write(this.ui.error('Agent Swarm is not available in this runtime.'));
        break;
      }
      await this.swarmCommands.cmdSwarm(args, this.smartInput!);
      break;

    default:
      process.stdout.write(this.ui.error(`Unknown command: /${cmd}. Run /help for reference.`));
    }
  }

  private async handleCompact(): Promise<void> {
    const msgCount = this.deepAgent.getMessageCount();
    if (msgCount < 4) {
      process.stdout.write(this.ui.warning(`Nothing to compact - only ${msgCount} messages.`));
      return;
    }
    process.stdout.write(this.ui.panel({
      title: 'Compact History',
      sections: [{ lines: [`Summarizing ${msgCount} messages...`] }],
    }));
    const result = await this.deepAgent.compactHistory();
    if (result.compacted) {
      process.stdout.write(this.ui.success(`History compacted: ${result.messagesBefore} -> ${result.messagesAfter} messages`));
    } else {
      process.stdout.write(this.ui.warning('Could not compact - summarization failed.'));
    }
  }

  private async handleBridgePrompt(message: string): Promise<void> {
    this.abortController = new AbortController();
    this.smartInput?.refresh();

    let externalStarted = false;
    let hasHeader = false;
    let streamed = false;
    let outputBuffer = '';
    const providerLabel = this.bridgeCommands?.getProviderLabel() || 'Bridge';

    const startExternal = () => {
      if (!externalStarted) {
        this.smartInput?.beginExternalOutput?.();
        externalStarted = true;
      }
    };

    const writeHeader = () => {
      if (!hasHeader) {
        startExternal();
        process.stdout.write(`\r\n${Colors.bold}${providerLabel}${Colors.reset}\r\n`);
        hasHeader = true;
      }
    };

    const flushOutput = () => {
      if (!outputBuffer) return;
      writeHeader();
      process.stdout.write(outputBuffer);
      outputBuffer = '';
    };

    try {
      this.getToolUi().reset();
      this.startSpinner(`${providerLabel} thinking`);
      const bridgeOutput = await this.bridgeCommands!.runPrompt(message, process.cwd(), {
        onOutputChunk: (chunk) => {
          streamed = true;
          this.stopSpinner();
          outputBuffer += chunk;
          if (this.shouldFlushStreamText(outputBuffer)) {
            flushOutput();
          }
        },
        onToolCall: (call) => {
          this.stopSpinner();
          flushOutput();
          writeHeader();
          this.getToolUi().handle({
            type: 'started',
            toolName: call.name,
            callId: call.id,
            input: call.arguments,
          });
          this.updateSpinner(`Bridge tool ${call.name}`);
        },
        onToolResult: (result) => {
          this.stopSpinner();
          writeHeader();
          if (result.status === 'ok') {
            this.getToolUi().handle({
              type: 'completed',
              toolName: result.name,
              callId: result.id,
              output: result.content || '',
            });
          } else {
            this.getToolUi().handle({
              type: 'failed',
              toolName: result.name,
              callId: result.id,
              message: result.error || 'Tool failed',
            });
          }
          this.updateSpinner(`${providerLabel} thinking`);
        },
        onRuntimeEvent: (event: CastRuntimeEvent) => {
          const projected = this.runtimeTelemetryProjector?.project(event);
          if (projected) {
            this.platformService.track(projected.type, projected.payload);
          }
        },
      });
      this.stopSpinner();
      flushOutput();

      if (!streamed && bridgeOutput) {
        writeHeader();
        process.stdout.write(bridgeOutput);
      }

      if (hasHeader) {
        const finalText = streamed ? bridgeOutput : '';
        if (!finalText.endsWith('\n') && !finalText.endsWith('\r\n')) {
          process.stdout.write('\r\n');
        }
        this.smartInput?.writeOutputLine(this.buildSeparatorLine());
      }
    } catch (error) {
      this.stopSpinner();
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.writeExternalBlock(this.ui.error(`Bridge prompt failed: ${errorMessage}`));
    } finally {
      if (externalStarted) {
        this.smartInput?.endExternalOutput?.();
      }
    }
  }

  private async autostartBridgeIfConfigured(): Promise<void> {
    if (!this.bridgeCommands?.startAutostart) {
      return;
    }

    try {
      const output = await this.bridgeCommands.startAutostart(process.cwd());
      if (output) {
        process.stdout.write(output.endsWith('\n') || output.endsWith('\r\n') ? output : `${output}\r\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(this.ui.warning(`Bridge autostart skipped: ${message}`));
    }
  }

  private writeExternalBlock(output: string): void {
    if (!output) {
      return;
    }
    const formatted = output.endsWith('\n') || output.endsWith('\r\n') ? output : `${output}\r\n`;
    this.smartInput?.beginExternalOutput?.();
    process.stdout.write(formatted);
    this.smartInput?.endExternalOutput?.();
  }

  private async handleMessage(message: string): Promise<void> {
    this.abortController = new AbortController();
    this.smartInput?.refresh();

    let separatorWritten = false;

    try {
      let messageToProcess = message;

      const forcePlanMode = this.inputMode === 'plan';
      const planCheck = forcePlanMode
        ? { shouldPlan: true }
        : await this.planMode.shouldEnterPlanMode(message);
      if (planCheck.shouldPlan) {
        if (forcePlanMode) {
          const plannedMessage = await this.runInteractivePlanMode(message);
          if (!plannedMessage) {
            this.smartInput?.refresh();
            return;
          }
          messageToProcess = plannedMessage;
        } else {
          const usePlan = await this.smartInput!.askChoice(
            '📝 Complex task. Create a plan?',
            [
              { key: 'y', label: 'yes', description: 'Create structured plan' },
              { key: 'n', label: 'no', description: 'Proceed without plan' },
            ]
          );

          if (!usePlan) {
            this.smartInput?.refresh();
            return;
          }

          if (usePlan === 'y') {
            const plannedMessage = await this.runInteractivePlanMode(message);
            if (!plannedMessage) {
              this.smartInput?.refresh();
              return;
            }
            messageToProcess = plannedMessage;
          } else {
            // No plan selected: wrap with execution directive so the agent acts immediately
            messageToProcess = `[EXECUTE NOW — no explanation, no questions, use tools immediately]\n\n${message}`;
          }
        }
      }

      const referenceResult = this.expandReferenceMentions(messageToProcess);
      messageToProcess = referenceResult.expandedMessage;

      const mentionResult = await this.mentionsService.processMessage(messageToProcess);
      if (referenceResult.references.length > 0) {
        for (const ref of referenceResult.references) {
          this.writeInline(`${Colors.dim}$${ref.name} ${ref.label} injected${Colors.reset}\r\n`);
        }
        this.writeInline('\r\n');
      }
      if (mentionResult.mentions.length > 0) {
        const summary = this.mentionsService.getMentionsSummary(mentionResult.mentions);
        for (const line of summary) {
          this.writeInline(`${Colors.dim}${line}${Colors.reset}\r\n`);
        }
        this.writeInline('\r\n');
      }

      this.getToolUi().reset();
      this.startSpinner('Thinking');

      let firstChunk = true;
      let hasToolOutput = false;
      let hasAssistantHeader = false;
      let textBuffer = '';
      let inTextMode = false;

      const startTextMode = () => {
        if (!inTextMode) {
          this.smartInput?.beginExternalOutput();
          if (!hasAssistantHeader) {
            process.stdout.write(`\r\n${Colors.bold}Cast${Colors.reset}\r\n`);
            hasAssistantHeader = true;
          }
          inTextMode = true;
        }
      };

      const endTextMode = () => {
        if (inTextMode) {
          if (textBuffer) {
            process.stdout.write(textBuffer);
            textBuffer = '';
          }
          process.stdout.write('\r\n');
          this.smartInput?.writeOutputLine(this.buildSeparatorLine());
          separatorWritten = true;
          this.smartInput?.endExternalOutput();
          inTextMode = false;
        }
      };

      const flushTextBuffer = () => {
        if (!textBuffer) return;
        if (inTextMode) {
          process.stdout.write(textBuffer);
        } else {
          this.writeInline(textBuffer);
        }
        textBuffer = '';
      };

      const handleStreamChunk = (chunk: ChatStreamChunk) => {
        if (chunk.kind === 'tool') {
          if (chunk.event.agentId) {
            if (chunk.event.type === 'started') {
              const summary = getToolInputSummary(chunk.event.toolName, chunk.event.input);
              this.agentTree?.setCurrentTool(
                chunk.event.agentId,
                `${getToolDisplayName(chunk.event.toolName)} ${summary}`.trim(),
              );
              this.compositor?.repaint();
            }
            return;
          }
          endTextMode();
          flushTextBuffer();
          const spinnerLabel = this.getToolUi().getSpinnerLabel(chunk.event);
          if (spinnerLabel) {
            this.updateSpinner(spinnerLabel);
          }
          this.getToolUi().handle(chunk.event);
          if (firstChunk && !hasToolOutput) {
            this.startSpinner('Working');
            hasToolOutput = true;
          }
          return;
        }

        if (chunk.kind === 'agent') {
          this.agentTree?.handle(chunk.event);
          this.compositor?.repaint();
          return;
        }

        const text = chunk.text;
        if (this.isMetaTextChunk(text)) {
          endTextMode();
          flushTextBuffer();
          this.writeInline(text);
          return;
        }

        if (firstChunk) {
          this.stopSpinner();
          firstChunk = false;
        }
        startTextMode();
        textBuffer += text;
        if (this.shouldFlushStreamText(textBuffer)) {
          flushTextBuffer();
        }
      };

      for await (const chunk of this.deepAgent.chat(mentionResult.expandedMessage)) {
        if (this.abortController?.signal.aborted) break;
        handleStreamChunk(chunk);
      }

      if (!firstChunk) {
        endTextMode();
      } else {
        this.stopSpinner();
      }
    } catch (error) {
      this.stopSpinner();
      const msg = (error as Error).message;
      if (!msg.includes('abort')) {
        this.writeInline(`\r\n  ${Colors.red}Error${Colors.reset}  ${Colors.dim}${msg}${Colors.reset}\r\n\r\n`);
      }
    } finally {
      this.abortController = null;
      this.agentTree?.clearAll();
      this.compositor?.repaint();
      if (!separatorWritten) {
        this.smartInput?.writeOutputLine(this.buildSeparatorLine());
      }
      this.smartInput?.refresh();
    }
  }

  private async runInteractivePlanMode(userMessage: string): Promise<string | null> {
    process.stdout.write(`\r\n${Colors.cyan}${Colors.bold}📋 PLAN MODE${Colors.reset}\r\n`);
    process.stdout.write(`${Colors.dim}Exploring project, then building plan…${Colors.reset}\r\n\r\n`);

    const projectContext = await this.planMode.gatherProjectContext();
    const clarifications: string[] = [];
    const questions = await this.planMode.generateClarifyingQuestions(userMessage);

    for (const question of questions) {
      const answer = await this.smartInput!.question(`${Colors.cyan}${question}${Colors.reset} `);
      if (answer.trim()) {
        clarifications.push(`${question} ${answer.trim()}`);
      }
    }

    const planningContext = clarifications.length > 0
      ? `${projectContext}\n\nUser clarifications:\n${clarifications.join('\n')}`
      : projectContext;
    let plan = await this.planMode.generatePlan(userMessage, planningContext);

    while (true) {
      process.stdout.write(this.planMode.formatPlanForDisplay(plan));

      const action = await this.smartInput!.askChoice('Plan options', [
        { key: 'a', label: 'accept', description: 'Use this plan and continue' },
        { key: 'r', label: 'refine', description: 'Refine plan with extra feedback' },
        { key: 'c', label: 'cancel', description: 'Cancel and return to prompt' },
      ]);

      if (!action || action === 'c') {
        process.stdout.write(`${Colors.dim}  Plan cancelled${Colors.reset}\r\n\r\n`);
        return null;
      }

      if (action === 'r') {
        const feedback = await this.smartInput!.question(`${Colors.cyan}Refinement feedback:${Colors.reset} `);
        if (!feedback.trim()) {
          process.stdout.write(`${Colors.dim}  No feedback provided. Keeping current plan.${Colors.reset}\r\n\r\n`);
          continue;
        }
        plan = await this.planMode.refinePlan(plan, feedback.trim());
        continue;
      }

      return this.buildPlanExecutionPrompt(userMessage, plan, clarifications);
    }
  }

  private buildPlanExecutionPrompt(userMessage: string, plan: { title: string; overview: string; steps: Array<{ id: number; description: string; files: string[] }> }, clarifications: string[]): string {
    const lines: string[] = [];
    lines.push(userMessage);
    lines.push('');
    lines.push('Approved execution plan:');
    lines.push(`Title: ${plan.title}`);
    lines.push(`Overview: ${plan.overview}`);
    lines.push('Steps:');
    for (const step of plan.steps) {
      const files = step.files.length > 0 ? ` | files: ${step.files.join(', ')}` : '';
      lines.push(`${step.id}. ${step.description}${files}`);
    }
    if (clarifications.length > 0) {
      lines.push('');
      lines.push('User clarifications:');
      lines.push(...clarifications);
    }
    lines.push('');
    lines.push('IMPORTANT EXECUTION RULES:');
    lines.push('- Execute ALL steps from start to finish WITHOUT stopping or pausing between them.');
    lines.push('- Do NOT ask "shall I continue?", "should I proceed?", or any variation of that.');
    lines.push('- Use write_todos to create todos for each step and mark them complete as you go.');
    lines.push('- Only return control to the user after ALL steps are fully completed.');
    lines.push('- If a step fails, fix it and continue — do not stop to ask for guidance.');
    return lines.join('\n');
  }

  private startSpinner(label: string): void {
    this.spinnerLabel = label;
    this.spinnerFrameIndex = 0;
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
    }
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrameIndex = (this.spinnerFrameIndex + 1) % Icons.spinner.length;
      this.smartInput?.refresh();
    }, 80);
    this.smartInput?.refresh();
  }

  private shouldFlushStreamText(buffer: string): boolean {
    if (buffer.length >= 24) return true;
    return /[\n.!?]$/.test(buffer);
  }

  private updateSpinner(label: string): void {
    this.spinnerLabel = label;
    this.smartInput?.refresh();
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.spinnerLabel = '';
    this.spinnerFrameIndex = 0;
    this.smartInput?.refresh();
  }

  private cmdTools(): void {
    const allTools = this.toolsRegistry.getAllTools();
    const sections: Array<{ title: string; lines: string[] }> = [];

    if (allTools.length > 0) {
      sections.push({
        title: `Built-in (${allTools.length})`,
        lines: allTools.map((t) => {
          const desc = t.description.length > 55 ? t.description.slice(0, 52) + '...' : t.description;
          return `${Colors.cyan}${t.name}${Colors.reset}  ${Colors.dim}${desc}${Colors.reset}`;
        }),
      });
    }

    const mcpTools = this.mcpRegistry.getAllMcpTools();
    if (mcpTools.length > 0) {
      const shown = mcpTools.slice(0, 15);
      const lines = shown.map((t) => {
        const desc = t.description.length > 50 ? t.description.slice(0, 47) + '...' : t.description;
        return `${Colors.cyan}${t.name}${Colors.reset}  ${Colors.dim}${desc}${Colors.reset}`;
      });
      if (mcpTools.length > 15) {
        lines.push(`${Colors.dim}... and ${mcpTools.length - 15} more. Run /mcp tools for full list${Colors.reset}`);
      }
      sections.push({ title: `MCP (${mcpTools.length})`, lines });
    }

    if (allTools.length === 0 && mcpTools.length === 0) {
      sections.push({ title: 'Available', lines: [`${Colors.dim}No tools available${Colors.reset}`] });
    }

    process.stdout.write(this.ui.panel({
      title: 'Tools',
      subtitle: `${allTools.length + mcpTools.length} available`,
      sections,
    }));
  }

  private getModelDisplayName(): string {
    const modelConfig = this.getDefaultModelConfig();
    return `${modelConfig.provider}/${modelConfig.model}`;
  }

  private getDefaultModelConfig(): { provider: ProviderType; model: string } {
    try {
      const modelConfig = this.configManager.getModelConfig('default');
      if (modelConfig?.provider && modelConfig?.model) {
        return {
          provider: modelConfig.provider,
          model: modelConfig.model,
        };
      }
    } catch {
    }

    return {
      provider: this.configService.getProvider() as ProviderType,
      model: this.configService.getModel(),
    };
  }

  private getInputFooterLines(): string[] {
    const terminalWidth = process.stdout.columns || 80;
    const right = this.getContextLeftFooterLabel();
    const left = this.getFooterLeftLabel('full');

    if (!right) {
      return [left];
    }

    const gap = Math.max(2, terminalWidth - visibleWidth(left) - visibleWidth(right));
    const combined = `${left}${' '.repeat(gap)}${right}`;

    if (visibleWidth(combined) <= terminalWidth) {
      return [combined];
    }

    const compactLeft = this.getFooterLeftLabel('compact');
    const compactGap = Math.max(2, terminalWidth - visibleWidth(compactLeft) - visibleWidth(right));
    const compactCombined = `${compactLeft}${' '.repeat(compactGap)}${right}`;

    if (visibleWidth(compactCombined) <= terminalWidth) {
      return [compactCombined];
    }

    const minimalLeft = this.getFooterLeftLabel('minimal');
    const minimalGap = Math.max(2, terminalWidth - visibleWidth(minimalLeft) - visibleWidth(right));
    const minimalCombined = `${minimalLeft}${' '.repeat(minimalGap)}${right}`;

    if (visibleWidth(minimalCombined) <= terminalWidth) {
      return [minimalCombined];
    }

    return [left];
  }

  private getFooterLeftLabel(mode: 'full' | 'compact' | 'minimal'): string {
    const parts: string[] = [];

    if (this.isProcessing && this.spinnerLabel) {
      const spinner = Icons.spinner[this.spinnerFrameIndex % Icons.spinner.length];
      parts.push(`${Colors.accent}${spinner} ${this.spinnerLabel.toLowerCase()}${Colors.reset}`);
    }

    if (mode !== 'minimal') {
      parts.push(this.getInputModeLabel());
      parts.push(`${Colors.dim}${mode === 'full' ? 'Shift+Tab mode' : 'Shift+Tab'}${Colors.reset}`);
    }

    parts.push(`${Colors.dim}${mode === 'full' ? 'Tab queue' : 'Tab'}${Colors.reset}`);

    if (this.toolUi?.hasExpandable()) {
      parts.push(`${Colors.dim}Ctrl+O expand tool${Colors.reset}`);
    }

    if (this.pendingLines.length > 0) {
      parts.push(`${Colors.magenta}queue ${this.pendingLines.length}${Colors.reset}`);
    }

    const separator = mode === 'full' ? '  ·  ' : ' · ';
    return parts.join(`${Colors.subtle}${separator}${Colors.reset}`);
  }

  private cycleInputMode(): void {
    const order: ReplInputMode[] = ['request-always', 'accept-edits', 'plan'];
    const currentIndex = order.indexOf(this.inputMode);
    this.inputMode = order[(currentIndex + 1) % order.length] ?? 'request-always';
    const newlineHint = process.stdin.isTTY ? 'Shift+Enter newline' : 'Ctrl+J newline';
    this.smartInput?.setFooterStatus({
      mode: this.getInputModeLabel(),
      model: this.getModelDisplayName(),
      hints: [newlineHint],
    });
    this.smartInput?.refresh();
  }

  private getInputModeLabel(): string {
    switch (this.inputMode) {
    case 'accept-edits':
      return `${Colors.green}ACCEPT EDITS${Colors.reset}`;
    case 'plan':
      return `${Colors.accent}PLAN MODE${Colors.reset}`;
    case 'request-always':
    default:
      return `${Colors.cyan}REQUEST ALWAYS${Colors.reset}`;
    }
  }

  private getContextLeftFooterLabel(): string {
    try {
      const modelConfig = typeof (this.configManager as any).getModelConfig === 'function'
        ? (this.configManager as any).getModelConfig()
        : undefined;
      const provider = modelConfig?.provider ?? this.configService.getProvider();
      const model = modelConfig?.model ?? this.configService.getModel();
      const tokenCount = typeof (this.deepAgent as any).getTokenCount === 'function'
        ? (this.deepAgent as any).getTokenCount()
        : 0;
      const usage = getModelContextUsage(provider, model, tokenCount);
      if (!usage) {
        return '';
      }
      return `${Colors.dim}${Math.round(usage.remainingPercent)}% context left${Colors.reset}`;
    } catch {
      return '';
    }
  }

  stop(): void {
    this.stopSpinner();
    if (this.kittySupported) {
      process.stdout.write(KITTY_DISABLE);
    } else if (process.stdin.isTTY) {
      process.stdout.write(MODIFY_OTHER_KEYS_DISABLE);
    }
    this.smartInput?.destroy();
  }

  async shutdown(): Promise<void> {
    this.stop();
    try {
      await this.saveSessionSummaryBeforeShutdown();
      await this.platformService.close();
    } finally {
      await this.endLocalStateSession();
    }
  }

  private async saveSessionSummaryBeforeShutdown(): Promise<void> {
    const saveSummary = (this.deepAgent as any).saveSessionSummaryToMemory;
    if (typeof saveSummary !== 'function') {
      return;
    }

    try {
      await saveSummary.call(this.deepAgent, { timeoutMs: 7000 });
    } catch {
      // Shutdown should not be blocked by best-effort memory summaries.
    }
  }

  private async startLocalStateSession(initResult: { projectPath?: string | null }): Promise<void> {
    if (!this.localSessionStore || this.localSessionId) {
      return;
    }

    try {
      const session = await this.localSessionStore.startSession({
        projectRoot: initResult.projectPath || process.cwd(),
        platformProjectId: this.getPlatformProjectId(),
        model: this.getModelDisplayName(),
      });
      this.localSessionId = session.id;
      this.deepAgent.setLocalSessionId(session.id);
    } catch (error) {
      this.warnLocalStateDisabled(error);
    }
  }

  private async endLocalStateSession(): Promise<void> {
    if (!this.localSessionStore || !this.localSessionId) {
      return;
    }

    const sessionId = this.localSessionId;
    this.localSessionId = null;
    this.deepAgent.setLocalSessionId(null);
    try {
      await this.localSessionStore.endSession(sessionId, {
        totalTokens: this.deepAgent.getTokenCount(),
      });
    } catch (error) {
      this.warnLocalStateDisabled(error);
    }
  }

  private getPlatformProjectId(): string | undefined {
    try {
      return (this.platformService as any).getProject?.()?.id;
    } catch {
      return undefined;
    }
  }

  private warnLocalStateDisabled(error: unknown): void {
    if (this.localStateWarningShown) {
      return;
    }
    this.localStateWarningShown = true;
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`  ${Colors.warning}! Local state disabled: ${message}${Colors.reset}\r\n`);
  }
}
