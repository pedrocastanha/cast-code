import { Injectable } from '@nestjs/common';
import { DeepAgentService } from '../../core/services/deep-agent.service';
import { ConfigService } from '../../../common/services/config.service';
import { ConfigManagerService } from '../../config/services/config-manager.service';
import { MentionsService } from '../../mentions/services/mentions.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { PlanModeService } from '../../core/services/plan-mode.service';
import { SmartInput } from './smart-input';
import { WelcomeScreenService } from './welcome-screen.service';
import { ReplCommandsService } from './commands/repl-commands.service';
import { GitCommandsService } from './commands/git-commands.service';
import { AgentCommandsService } from './commands/agent-commands.service';
import { McpCommandsService } from './commands/mcp-commands.service';
import { ConfigCommandsService } from '../../config/services/config-commands.service';
import { ProjectCommandsService } from './commands/project-commands.service';
import { SnapshotCommandsService } from './commands/snapshot-commands.service';
import { StatsCommandsService } from './commands/stats-commands.service';
import { ReplayCommandsService } from './commands/replay-commands.service';
import { VaultCommandsService } from './commands/vault-commands.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { FilesystemToolsService } from '../../tools/services/filesystem-tools.service';
import { KanbanServerService } from '../../kanban/services/kanban-server.service';
import { RemoteServerService } from '../../remote/services/remote-server.service';
import { PermissionService } from '../../permissions/services/permission.service';
import {
  DangerLevel,
  PermissionResponse,
  PermissionScope,
} from '../../permissions/types/permission.types';
import { Colors, Icons } from '../utils/theme';

@Injectable()
export class ReplService {
  private smartInput: SmartInput | null = null;
  private abortController: AbortController | null = null;
  private isProcessing = false;
  private isBroadcasting = false;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;

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
    private readonly replayCommandsService: ReplayCommandsService,
    private readonly vaultCommandsService: VaultCommandsService,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly kanbanServer: KanbanServerService,
    private readonly remoteServer: RemoteServerService,
    private readonly permissionService: PermissionService,
    private readonly filesystemTools: FilesystemToolsService,
  ) { }

  async start(): Promise<void> {
    const initResult = await this.deepAgent.initialize();
    const agentCount = this.agentRegistry.resolveAllAgents().length;

    this.welcomeScreen.printWelcomeScreen({
      projectPath: initResult.projectPath || undefined,
      model: this.getModelDisplayName(),
      toolCount: initResult.toolCount,
      agentCount,
    });

    // Intercept stdout to broadcast to remote UI.
    // Only broadcast while isProcessing=true (AI responding / tools running).
    // This prevents SmartInput cursor-movement / autocomplete renders from
    // being sent to the remote client and corrupting the local terminal state.
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

    // Callback when remote UI sends a message
    this.remoteServer.onMessage(async (msg) => {
      // To show properly on UI and terminal
      process.stdout.write(`\r\x1b[K${Colors.cyan}${Colors.bold}>${Colors.reset} ${msg}\r\n`);
      await this.handleLine(msg);
    });

    this.smartInput = new SmartInput({
      prompt: `${Colors.cyan}${Colors.bold}>${Colors.reset} `,
      promptVisibleLen: 2,
      getCommandSuggestions: (input) => this.getCommandSuggestions(input),
      getMentionSuggestions: (partial) => this.getMentionSuggestions(partial),
      onSubmit: (line) => this.handleLine(line),
      onCancel: () => this.handleCancel(),
      onExit: () => this.handleExit(),
    });

    this.permissionService.setPermissionHandler((command, dangerLevel) =>
      this.handlePermissionPrompt(command, dangerLevel),
    );

    this.filesystemTools.setFileWriteHandler((filePath, diffPreview, isNew) =>
      this.handleFileWritePrompt(filePath, diffPreview, isNew),
    );

    this.smartInput.start();
  }

  private async handlePermissionPrompt(
    command: string,
    dangerLevel: DangerLevel,
  ): Promise<PermissionResponse> {
    this.stopSpinner();
    this.smartInput?.pause();

    try {
      process.stdout.write('\r\n');
      process.stdout.write(`  ${Colors.yellow}Permission required${Colors.reset}\r\n`);
      process.stdout.write(`  ${Colors.dim}${'─'.repeat(40)}${Colors.reset}\r\n`);
      process.stdout.write(`  ${Colors.dim}${command}${Colors.reset}\r\n`);
      process.stdout.write('\r\n');

      if (dangerLevel === DangerLevel.DANGEROUS) {
        process.stdout.write(
          `  ${Colors.red}Warning: this command is potentially dangerous${Colors.reset}\r\n\r\n`,
        );
      }

      const choices = [
        { key: 'allow-once', label: 'Allow once', description: 'Execute just this time' },
        {
          key: 'allow-session',
          label: 'Allow for session',
          description: 'Allow during this session',
        },
        ...(dangerLevel !== DangerLevel.DANGEROUS
          ? [
              {
                key: 'allow-always',
                label: 'Always allow',
                description: 'Never ask again for this command',
              },
            ]
          : []),
        { key: 'deny', label: 'Deny', description: 'Do not execute' },
      ] as const;

      const choice = await this.smartInput!.askChoice('What do you want to do?', [...choices]);

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
    this.stopSpinner();
    this.smartInput?.pause();

    try {
      const rel = filePath.startsWith(process.cwd())
        ? filePath.slice(process.cwd().length + 1)
        : filePath;

      process.stdout.write('\r\n');
      process.stdout.write(`  ${Colors.yellow}${isNew ? 'Create' : 'Edit'} file${Colors.reset}  ${Colors.cyan}${rel}${Colors.reset}\r\n`);
      process.stdout.write(`  ${Colors.dim}${'─'.repeat(50)}${Colors.reset}\r\n`);

      if (!isNew && diffPreview) {
        const lines = diffPreview.split('\n');
        for (const line of lines) {
          const trimmed = line;
          if (trimmed.startsWith('+')) {
            process.stdout.write(`  ${Colors.green}${trimmed}${Colors.reset}\r\n`);
          } else if (trimmed.startsWith('-')) {
            process.stdout.write(`  ${Colors.red}${trimmed}${Colors.reset}\r\n`);
          } else {
            process.stdout.write(`  ${Colors.dim}${trimmed}${Colors.reset}\r\n`);
          }
        }
        process.stdout.write('\r\n');
      } else if (isNew) {
        process.stdout.write(`  ${Colors.dim}(new file)${Colors.reset}\r\n\r\n`);
      }

      const choices = [
        { key: 'yes', label: 'Allow', description: 'Apply this change' },
        { key: 'session', label: 'Allow all', description: 'Allow all file changes this session' },
        { key: 'no', label: 'Deny', description: 'Skip this change' },
      ] as const;

      const choice = await this.smartInput!.askChoice('Apply change?', [...choices]);

      if (choice === 'session') {
        this.filesystemTools.setFileWriteHandler(() => Promise.resolve(true));
      }

      return choice !== 'no';
    } finally {
      this.smartInput?.resume();
    }
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
      { text: '/model', display: '/model', description: 'Show model' },
      { text: '/config', display: '/config', description: 'Configuration' },
      { text: '/project', display: '/project', description: 'Project context' },
      { text: '/project-deep', display: '/project-deep', description: 'Deep project analysis' },
      { text: '/init', display: '/init', description: 'Analyze project and generate context' },
      { text: '/mcp', display: '/mcp', description: 'MCP servers' },
      { text: '/kanban', display: '/kanban', description: 'Open kanban board' },
      { text: '/remote', display: '/remote', description: 'Start remote web interface via ngrok' },
      { text: '/rollback', display: '/rollback', description: 'Rollback file to previous snapshot' },
      { text: '/stats', display: '/stats', description: 'Show session usage stats' },
      { text: '/replay', display: '/replay', description: 'Save or view session replays' },
      { text: '/vault', display: '/vault', description: 'Manage code snippet vault' },
    ];

    return commands.filter(c => c.text.startsWith(input));
  }

  private getMentionSuggestions(partial: string): Array<{ text: string; display: string; description: string }> {
    const fs = require('fs');
    const path = require('path');

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
          .filter(e => !ignore.includes(e.name))
          .filter(e => !e.name.startsWith('.') || prefix.startsWith('.') || e.name === '.cast' || e.name === '.claude')
          .filter(e => prefix === '' || e.name.toLowerCase().startsWith(prefix.toLowerCase()))
          .map(e => {
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
    this.stop();
    process.exit(0);
  }

  private async handleLine(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      this.smartInput?.showPrompt();
      return;
    }

    this.isBroadcasting = true;
    try {
      if (trimmed.startsWith('/')) {
        await this.handleCommand(trimmed);
      } else {
        await this.handleMessage(trimmed);
      }
    } finally {
      this.isBroadcasting = false;
    }

    this.smartInput?.showPrompt();
  }

  private async handleCommand(command: string): Promise<void> {
    const parts = command.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help': this.replCommands.printHelp(); break;
      case 'clear': this.replCommands.cmdClear(this.welcomeScreen); break;
      case 'exit':
      case 'quit': this.handleExit(); return;
      case 'compact': await this.handleCompact(); break;
      case 'context': this.replCommands.cmdContext(); break;
      case 'config':
        await this.configCommands.handleConfigCommand(args, this.smartInput!);
        await this.configManager.loadConfig();
        await this.deepAgent.reinitializeModel();
        break;
      case 'model': this.replCommands.cmdModel(args); break;
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
      case 'project-deep':
        const deepResult = await this.projectCommands.cmdProject(['deep'], this.smartInput!);
        if (typeof deepResult === 'string') {
          return await this.handleMessage(deepResult);
        }
        break;

      case 'kanban':
        this.kanbanServer.start(!this.remoteServer.getIsRunning());
        if (this.remoteServer.getIsRunning()) {
          const remoteUrl = this.remoteServer.getPublicUrl();
          if (remoteUrl) {
            process.stdout.write(`  Kanban board → ${remoteUrl}/kanban\r\n`);
          } else {
            process.stdout.write(`  Kanban board → http://localhost:3333\r\n`);
          }
        } else {
          process.stdout.write(`  Kanban board → http://localhost:3333\r\n`);
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
      case 'replay':
        this.replayCommandsService.cmdReplay(args.join(' '));
        break;
      case 'vault':
        this.vaultCommandsService.cmdVault(args.join(' '));
        break;

      default:
        process.stdout.write(`  ${Colors.red}Unknown command:${Colors.reset} ${Colors.dim}/${cmd}${Colors.reset}  ${Colors.dim}Run /help for reference${Colors.reset}\r\n`);
    }
  }

  private async handleCompact(): Promise<void> {
    const msgCount = this.deepAgent.getMessageCount();
    if (msgCount < 4) {
      process.stdout.write(`  ${Colors.dim}Nothing to compact — only ${msgCount} messages${Colors.reset}\r\n`);
      return;
    }
    process.stdout.write(`  ${Colors.dim}Summarizing ${msgCount} messages...${Colors.reset}\r\n`);
    const result = await this.deepAgent.compactHistory();
    if (result.compacted) {
      process.stdout.write(`  ${Colors.green}✓${Colors.reset}${Colors.dim} History compacted: ${result.messagesBefore} → ${result.messagesAfter} messages${Colors.reset}\r\n`);
    } else {
      process.stdout.write(`  ${Colors.yellow}Could not compact — summarization failed${Colors.reset}\r\n`);
    }
  }

  private async handleMessage(message: string): Promise<void> {
    this.isProcessing = true;
    this.abortController = new AbortController();
    this.smartInput?.enterPassiveMode();

    try {
      let messageToProcess = message;

      const planCheck = await this.planMode.shouldEnterPlanMode(message);
      if (planCheck.shouldPlan) {
        const usePlan = await this.smartInput!.askChoice(
          '📝 Complex task. Create a plan?',
          [
            { key: 'y', label: 'yes', description: 'Create structured plan' },
            { key: 'n', label: 'no', description: 'Proceed without plan' },
          ]
        );

        if (usePlan === 'y') {
          const plannedMessage = await this.runInteractivePlanMode(message);
          if (!plannedMessage) {
            this.isProcessing = false;
            this.smartInput?.exitPassiveMode();
            return;
          }
          messageToProcess = plannedMessage;
        }
      }

      const mentionResult = await this.mentionsService.processMessage(messageToProcess);
      if (mentionResult.mentions.length > 0) {
        const summary = this.mentionsService.getMentionsSummary(mentionResult.mentions);
        for (const line of summary) {
          process.stdout.write(`${Colors.dim}${line}${Colors.reset}\r\n`);
        }
        process.stdout.write('\r\n');
      }

      this.startSpinner('Thinking');

      let firstChunk = true;
      let fullResponse = '';

      // Map tool names to human-readable spinner labels
      const toolLabel = (chunk: string): string | null => {
        if (chunk.includes('▶ read file') || chunk.includes('▶ read_file')) return 'Reading';
        if (chunk.includes('▶ write file') || chunk.includes('▶ write_file')) return 'Writing';
        if (chunk.includes('▶ edit file') || chunk.includes('▶ edit_file')) return 'Editing';
        if (chunk.includes('▶ shell')) return 'Running';
        if (chunk.includes('▶ glob') || chunk.includes('▶ grep') || chunk.includes('▶ ls')) return 'Searching';
        if (chunk.includes('▶ web search') || chunk.includes('▶ web_search')) return 'Searching web';
        if (chunk.includes('▶ web fetch') || chunk.includes('▶ web_fetch')) return 'Fetching';
        if (chunk.includes('▶ memory')) return 'Memory';
        if (chunk.includes('▶ task')) return 'Tasks';
        if (chunk.includes('▶')) return 'Working';
        return null;
      };

      const isMetaOutput = (chunk: string): boolean =>
        chunk.includes('tokens:') || chunk.includes('conversation compacted');

      // Tool result chunks (formatToolEnd) start with dim ANSI codes and are indented
      // They do NOT start with a plain printable character — real text responses do
      const isToolResultChunk = (chunk: string): boolean =>
        chunk.startsWith('\x1b[2m') || (chunk.startsWith('\n\x1b') && !chunk.includes('▶'));

      for await (const chunk of this.deepAgent.chat(mentionResult.expandedMessage)) {
        if (this.abortController?.signal.aborted) break;

        // Detect tool invocation — update spinner label before stopping
        const newLabel = toolLabel(chunk);
        if (newLabel) {
          this.updateSpinner(newLabel);
        }

        const isMeta = isMetaOutput(chunk);
        const isToolChunk = newLabel !== null;

        if (isToolChunk) {
          // Stop spinner before tool output to avoid clobbering lines
          this.stopSpinner();
          process.stdout.write(chunk);
          // Restart spinner after tool output (if no text response yet)
          if (firstChunk) {
            this.startSpinner('Working');
          }
        } else if (isMeta || isToolResultChunk(chunk)) {
          // Tool results or meta info — print as-is without triggering response header
          process.stdout.write(chunk);
        } else {
          // Real AI text chunk — print response header on first one
          if (firstChunk) {
            this.stopSpinner();
            process.stdout.write(`\r\n${Colors.bold}Cast${Colors.reset}\r\n`);
            firstChunk = false;
          }
          fullResponse += chunk;
          process.stdout.write(chunk);
        }
      }

      if (!firstChunk) {
        process.stdout.write('\r\n');
      } else {
        this.stopSpinner();
      }
    } catch (error) {
      this.stopSpinner();
      const msg = (error as Error).message;
      if (!msg.includes('abort')) {
        process.stdout.write(`\r\n  ${Colors.red}Error${Colors.reset}  ${Colors.dim}${msg}${Colors.reset}\r\n\r\n`);
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      this.smartInput?.exitPassiveMode();
    }
  }

  private async runInteractivePlanMode(userMessage: string): Promise<string | null> {
    process.stdout.write(`\r\n${Colors.cyan}${Colors.bold}📋 PLAN MODE${Colors.reset}\r\n`);
    process.stdout.write(`${Colors.dim}Build plan first, execute after approval${Colors.reset}\r\n\r\n`);

    const clarifyingQuestions = await this.planMode.generateClarifyingQuestions(userMessage);
    const answers: string[] = [];

    if (clarifyingQuestions.length > 0) {
      process.stdout.write(`${Colors.dim}I need a few quick clarifications:${Colors.reset}\r\n`);
      for (let i = 0; i < clarifyingQuestions.length; i++) {
        const q = clarifyingQuestions[i];
        const answer = await this.smartInput!.question(`${Colors.yellow}Q${i + 1}:${Colors.reset} ${q} `);
        if (answer.trim()) {
          answers.push(`- ${q} => ${answer.trim()}`);
        }
      }
      process.stdout.write('\r\n');
    }

    const context = answers.length > 0 ? `User clarifications:\n${answers.join('\n')}` : undefined;
    let plan = await this.planMode.generatePlan(userMessage, context);

    while (true) {
      process.stdout.write(this.planMode.formatPlanForDisplay(plan));

      const action = await this.smartInput!.askChoice('Plan options', [
        { key: 'a', label: 'accept', description: 'Use this plan and continue' },
        { key: 'r', label: 'refine', description: 'Refine plan with extra feedback' },
        { key: 'c', label: 'cancel', description: 'Cancel and return to prompt' },
      ]);

      if (action === 'c') {
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

      return this.buildPlanExecutionPrompt(userMessage, plan, answers);
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
    lines.push('Execute the task following this approved plan and report progress by step.');
    return lines.join('\n');
  }

  private spinnerLabel = 'Thinking';

  private startSpinner(label: string): void {
    this.spinnerLabel = label;
    let i = 0;
    this.spinnerTimer = setInterval(() => {
      const spinner = Icons.spinner[i % Icons.spinner.length];
      i++;
      process.stdout.write(
        `\r${Colors.dim}${spinner}${Colors.reset} ${Colors.dim}${this.spinnerLabel}...${Colors.reset}`
      );
    }, 80);
  }

  private updateSpinner(label: string): void {
    this.spinnerLabel = label;
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
      process.stdout.write('\r\x1b[K');
    }
  }

  private cmdTools(): void {
    const allTools = this.toolsRegistry.getAllTools();
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');

    if (allTools.length > 0) {
      const maxLen = Math.max(...allTools.map(t => t.name.length));
      w(`  ${Colors.bold}Built-in${Colors.reset}  ${Colors.dim}(${allTools.length})${Colors.reset}\r\n`);
      w(`  ${Colors.dim}${'─'.repeat(48)}${Colors.reset}\r\n`);
      for (const t of allTools) {
        const desc = t.description.length > 55 ? t.description.slice(0, 52) + '...' : t.description;
        w(`  ${Colors.cyan}${t.name.padEnd(maxLen)}${Colors.reset}  ${Colors.dim}${desc}${Colors.reset}\r\n`);
      }
    }

    const mcpTools = this.mcpRegistry.getAllMcpTools();
    if (mcpTools.length > 0) {
      w('\r\n');
      const shown = mcpTools.slice(0, 15);
      const maxLen = Math.max(...shown.map(t => t.name.length));
      w(`  ${Colors.bold}MCP${Colors.reset}  ${Colors.dim}(${mcpTools.length})${Colors.reset}\r\n`);
      w(`  ${Colors.dim}${'─'.repeat(48)}${Colors.reset}\r\n`);
      for (const t of shown) {
        const desc = t.description.length > 50 ? t.description.slice(0, 47) + '...' : t.description;
        w(`  ${Colors.cyan}${t.name.padEnd(maxLen)}${Colors.reset}  ${Colors.dim}${desc}${Colors.reset}\r\n`);
      }
      if (mcpTools.length > 15) {
        w(`  ${Colors.dim}... and ${mcpTools.length - 15} more. Run /mcp tools for full list${Colors.reset}\r\n`);
      }
    }

    if (allTools.length === 0 && mcpTools.length === 0) {
      w(`  ${Colors.dim}No tools available${Colors.reset}\r\n`);
    }

    w('\r\n');
  }

  private getModelDisplayName(): string {
    try {
      const modelConfig = this.configManager.getModelConfig('default');
      if (modelConfig) {
        return `${modelConfig.provider}/${modelConfig.model}`;
      }
    } catch {
    }
    return `${this.configService.getProvider()}/${this.configService.getModel()}`;
  }

  stop(): void {
    this.stopSpinner();
    this.smartInput?.destroy();
  }
}
