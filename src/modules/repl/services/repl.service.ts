import { Injectable } from '@nestjs/common';
import { DeepAgentService } from '../../core/services/deep-agent.service';
import { ConfigService } from '../../../common/services/config.service';
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
import { Colors, Icons } from '../utils/theme';

@Injectable()
export class ReplService {
  private smartInput: SmartInput | null = null;
  private abortController: AbortController | null = null;
  private isProcessing = false;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly deepAgent: DeepAgentService,
    private readonly configService: ConfigService,
    private readonly mentionsService: MentionsService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly welcomeScreen: WelcomeScreenService,
    private readonly planMode: PlanModeService,
    // Command services
    private readonly replCommands: ReplCommandsService,
    private readonly gitCommands: GitCommandsService,
    private readonly agentCommands: AgentCommandsService,
    private readonly mcpCommands: McpCommandsService,
  ) {}

  async start(): Promise<void> {
    const initResult = await this.deepAgent.initialize();
    const agentCount = this.agentRegistry.resolveAllAgents().length;

    this.welcomeScreen.printWelcomeScreen({
      projectPath: initResult.projectPath || undefined,
      model: `${this.configService.getProvider()}/${this.configService.getModel()}`,
      toolCount: initResult.toolCount,
      agentCount,
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

    this.smartInput.start();
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
      { text: '/init', display: '/init', description: 'Initialize .cast/' },
      { text: '/mcp', display: '/mcp', description: 'MCP servers' },
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

  private getFileEntries(partial: string): Array<{ text: string; display: string; description: string }> {
    const fs = require('fs');
    const path = require('path');

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
        .filter(e => !e.name.startsWith('.') || prefix.startsWith('.'))
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
  }

  private handleCancel(): void {
    if (this.isProcessing && this.abortController) {
      this.abortController.abort();
      this.stopSpinner();
      process.stdout.write(`\r\n${Colors.yellow}  Cancelled${Colors.reset}\r\n\r\n`);
      this.isProcessing = false;
    } else {
      process.stdout.write(`${Colors.dim}  (Use /exit to quit)${Colors.reset}\r\n`);
      this.smartInput?.showPrompt();
    }
  }

  private handleExit(): void {
    process.stdout.write(`${Colors.dim}  Goodbye!${Colors.reset}\r\n`);
    process.exit(0);
  }

  private async handleLine(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      this.smartInput?.showPrompt();
      return;
    }

    if (trimmed.startsWith('/')) {
      await this.handleCommand(trimmed);
    } else {
      await this.handleMessage(trimmed);
    }

    this.smartInput?.showPrompt();
  }

  private async handleCommand(command: string): Promise<void> {
    const parts = command.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      // Repl commands
      case 'help': this.replCommands.printHelp(); break;
      case 'clear': this.replCommands.cmdClear(this.welcomeScreen); break;
      case 'exit':
      case 'quit': process.exit(0);
      case 'compact': this.deepAgent.clearHistory(); process.stdout.write(`${Colors.green}  Compacted${Colors.reset}\r\n`); break;
      case 'context': this.replCommands.cmdContext(); break;
      case 'config': this.replCommands.cmdConfig(); break;
      case 'model': this.replCommands.cmdModel(args); break;
      case 'init': this.replCommands.cmdInit(); break;
      case 'mentions': this.replCommands.cmdMentionsHelp(); break;
      case 'tools': this.cmdTools(); break;

      // Git commands
      case 'status': this.gitCommands.runGit('git status'); break;
      case 'diff': this.gitCommands.runGit(args.length ? `git diff ${args.join(' ')}` : 'git diff'); break;
      case 'log': this.gitCommands.runGit('git log --oneline -15'); break;
      case 'commit': await this.gitCommands.cmdCommit(args, this.smartInput!); break;
      case 'up': await this.gitCommands.cmdUp(this.smartInput!); break;
      case 'split-up': await this.gitCommands.cmdSplitUp(this.smartInput!); break;
      case 'pr': await this.gitCommands.cmdPr(this.smartInput!); break;
      case 'review': await this.gitCommands.cmdReview(args); break;
      case 'fix': await this.gitCommands.cmdFix(args); break;
      case 'ident': await this.gitCommands.cmdIdent(); break;
      case 'release': await this.gitCommands.cmdRelease(args); break;

      // Agent/Skill commands
      case 'agents': await this.agentCommands.cmdAgents(args, this.smartInput!); break;
      case 'skills': await this.agentCommands.cmdSkills(args, this.smartInput!); break;

      // MCP commands
      case 'mcp': await this.mcpCommands.cmdMcp(args, this.smartInput!); break;

      default:
        process.stdout.write(`${Colors.red}  Unknown: /${cmd}${Colors.reset}  ${Colors.dim}Try /help${Colors.reset}\r\n`);
    }
  }

  private async handleMessage(message: string): Promise<void> {
    this.isProcessing = true;
    this.abortController = new AbortController();
    this.smartInput?.enterPassiveMode();

    try {
      // Check if we should enter plan mode
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
          // Plan mode handling would go here
          process.stdout.write(`${Colors.dim}  Plan mode: Not yet implemented in modular version${Colors.reset}\r\n\r\n`);
          this.isProcessing = false;
          this.smartInput?.exitPassiveMode();
          return;
        }
      }

      // Process mentions
      const mentionResult = await this.mentionsService.processMessage(message);
      if (mentionResult.mentions.length > 0) {
        const summary = this.mentionsService.getMentionsSummary(mentionResult.mentions);
        for (const line of summary) {
          process.stdout.write(`${Colors.dim}${line}${Colors.reset}\r\n`);
        }
        process.stdout.write('\r\n');
      }

      // Start spinner
      this.startSpinner('Thinking');

      // Stream response
      let firstChunk = true;
      let fullResponse = '';

      for await (const chunk of this.deepAgent.chat(mentionResult.expandedMessage)) {
        if (this.abortController?.signal.aborted) break;

        const isToolOutput = chunk.includes('\x1b[') && (
          chunk.includes('⏿') ||
          chunk.includes('tokens:') ||
          chunk.includes('conversation compacted')
        );

        if (firstChunk && !isToolOutput) {
          this.stopSpinner();
          process.stdout.write(`\r\n${Colors.magenta}${Colors.bold}Cast${Colors.reset}\r\n`);
          firstChunk = false;
        }

        if (!isToolOutput) {
          fullResponse += chunk;
        }
        process.stdout.write(chunk);
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
        process.stdout.write(`\r\n${Colors.red}  Error: ${msg}${Colors.reset}\r\n\r\n`);
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      this.smartInput?.exitPassiveMode();
    }
  }

  private startSpinner(label: string): void {
    let i = 0;
    this.spinnerTimer = setInterval(() => {
      process.stdout.write(`\r${Colors.cyan}${Icons.spinner[i++ % Icons.spinner.length]}${Colors.reset} ${Colors.dim}${label}...${Colors.reset}`);
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
      process.stdout.write('\r\x1b[K');
    }
  }

  private cmdTools(): void {
    const tools = [
      ['read_file', 'Read file contents'],
      ['write_file', 'Write/create files'],
      ['edit_file', 'Edit files'],
      ['glob', 'Find files by pattern'],
      ['grep', 'Search file contents'],
      ['ls', 'List directory'],
      ['shell', 'Execute commands'],
      ['web_search', 'Web search'],
      ['web_fetch', 'Fetch URL content'],
    ];

    const maxLen = Math.max(...tools.map(([n]) => n.length));
    
    process.stdout.write('\r\n');
    process.stdout.write(`${Colors.bold}Tools (${tools.length}):${Colors.reset}\r\n`);
    for (const [name, desc] of tools) {
      process.stdout.write(`  ${Colors.cyan}${name.padEnd(maxLen)}${Colors.reset}  ${Colors.dim}${desc}${Colors.reset}\r\n`);
    }

    const mcpTools = this.mcpRegistry.getAllMcpTools();
    if (mcpTools.length > 0) {
      process.stdout.write(`\r\n${Colors.bold}MCP Tools (${mcpTools.length}):${Colors.reset}\r\n`);
      for (const t of mcpTools.slice(0, 10)) {
        process.stdout.write(`  ${Colors.cyan}${t.name}${Colors.reset}  ${Colors.dim}${t.description.slice(0, 50)}${Colors.reset}\r\n`);
      }
    }
    process.stdout.write('\r\n');
  }

  stop(): void {
    this.stopSpinner();
    this.smartInput?.destroy();
  }
}
