import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DeepAgentService } from '../../core/services/deep-agent.service';
import { ConfigService } from '../../../common/services/config.service';
import { MarkdownRendererService } from '../../../common/services/markdown-renderer.service';
import { MentionsService } from '../../mentions/services/mentions.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { CommitGeneratorService } from '../../git/services/commit-generator.service';
import { MonorepoDetectorService } from '../../git/services/monorepo-detector.service';
import { PrGeneratorService } from '../../git/services/pr-generator.service';
import { CodeReviewService } from '../../git/services/code-review.service';
import { ReleaseNotesService } from '../../git/services/release-notes.service';
import { PlanModeService } from '../../core/services/plan-mode.service';
import { SmartInput, Suggestion } from './smart-input';
import { Colors, Icons, UI, colorize, Box } from '../utils/theme';
import { WelcomeScreenService } from './welcome-screen.service';

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
    private readonly welcomeScreenService: WelcomeScreenService,
    private readonly commitGenerator: CommitGeneratorService,
    private readonly monorepoDetector: MonorepoDetectorService,
    private readonly prGenerator: PrGeneratorService,
    private readonly markdownRenderer: MarkdownRendererService,
    private readonly codeReviewService: CodeReviewService,
    private readonly releaseNotesService: ReleaseNotesService,
    private readonly planModeService: PlanModeService,
  ) {}

  async start() {
    const initResult = await this.deepAgent.initialize();

    const provider = this.configService.getProvider();
    const model = this.configService.getModel();
    const agentCount = this.agentRegistry.resolveAllAgents().length;

    this.welcomeScreenService.printWelcomeScreen({
      projectPath: initResult.projectPath || undefined,
      model: `${provider}/${model}`,
      toolCount: initResult.toolCount,
      agentCount: agentCount,
    });

    this.smartInput = new SmartInput({
      prompt: `${Colors.cyan}${Colors.bold}>${Colors.reset} `,
      promptVisibleLen: 2,
      getCommandSuggestions: (input) => this.getCommandSuggestions(input),
      getMentionSuggestions: (partial) => this.getMentionSuggestions(partial),
      onSubmit: (line) => this.handleLine(line),
      onCancel: () => this.handleCancel(),
      onExit: () => this.handleExit(),
      onExpandToolOutput: () => this.showToolOutputs(),
    });

    this.smartInput.start();
  }

  private getCommandSuggestions(input: string): Suggestion[] {
    if (input.startsWith('/mcp ')) {
      return [
        { text: '/mcp list',  display: '/mcp list',  description: 'List servers' },
        { text: '/mcp tools', display: '/mcp tools', description: 'List MCP tools' },
        { text: '/mcp add',   display: '/mcp add',   description: 'Add new server' },
        { text: '/mcp help',  display: '/mcp help',  description: 'Setup guide' },
      ].filter(s => s.text.startsWith(input));
    }

    if (input.startsWith('/agents ')) {
      return [
        { text: '/agents create', display: '/agents create', description: 'Create new agent' },
      ].filter(s => s.text.startsWith(input));
    }

    if (input.startsWith('/skills ')) {
      return [
        { text: '/skills create', display: '/skills create', description: 'Create new skill' },
      ].filter(s => s.text.startsWith(input));
    }

    const commands: Suggestion[] = [
      { text: '/help',     display: '/help',     description: 'Show help' },
      { text: '/clear',    display: '/clear',    description: 'Clear conversation' },
      { text: '/compact',  display: '/compact',  description: 'Compact history' },
      { text: '/exit',     display: '/exit',     description: 'Exit' },
      { text: '/status',   display: '/status',   description: 'Git status' },
      { text: '/diff',     display: '/diff',     description: 'Git diff' },
      { text: '/log',      display: '/log',      description: 'Git log' },
      { text: '/commit',   display: '/commit',   description: 'Commit changes' },
      { text: '/up',       display: '/up',       description: 'Smart commit & push' },
      { text: '/split-up', display: '/split-up', description: 'Split into multiple commits' },
      { text: '/pr',       display: '/pr',       description: 'Create Pull Request' },
      { text: '/review',   display: '/review',   description: 'Code review files' },
      { text: '/fix',      display: '/fix',      description: 'Auto-fix code issues' },
      { text: '/ident',    display: '/ident',    description: 'Indent/format all code' },
      { text: '/release',  display: '/release',  description: 'Generate release notes' },
      { text: '/tools',    display: '/tools',    description: 'List tools' },
      { text: '/agents',   display: '/agents',   description: 'List/manage agents' },
      { text: '/skills',   display: '/skills',   description: 'List/manage skills' },
      { text: '/context',  display: '/context',  description: 'Session info' },
      { text: '/mentions', display: '/mentions',  description: 'Mentions help (@)' },
      { text: '/model',    display: '/model',    description: 'Show model' },
      { text: '/config',   display: '/config',   description: 'Show configuration' },
      { text: '/init',     display: '/init',     description: 'Initialize .cast/' },
      { text: '/mcp',      display: '/mcp',      description: 'MCP servers' },
    ];

    return commands.filter(c => c.text.startsWith(input));
  }

  private getMentionSuggestions(partial: string): Suggestion[] {
    const gitOpts: Suggestion[] = [
      { text: '@git:status', display: '@git:status', description: 'Git status' },
      { text: '@git:diff',   display: '@git:diff',   description: 'Git diff' },
      { text: '@git:log',    display: '@git:log',     description: 'Git log' },
      { text: '@git:branch', display: '@git:branch',  description: 'Branches' },
      { text: '@git:stash',  display: '@git:stash',   description: 'Stash list' },
    ];

    if (partial === '') {
      return [...gitOpts, ...this.getFileEntries('')];
    }

    if (partial.startsWith('git:') || partial === 'git') {
      return gitOpts.filter(o => o.text.startsWith('@' + partial));
    }

    if (partial.includes('/')) {
      const results = this.getFileEntries(partial);
      if (partial.startsWith('g')) {
        return [...gitOpts.filter(o => o.text.startsWith('@' + partial)), ...results];
      }
      return results;
    }

    const dirEntries = this.getFileEntries(partial);
    const fuzzyEntries = this.getFuzzyFileEntries(partial);

    const seen = new Set(dirEntries.map(e => e.text));
    const merged = [...dirEntries];
    for (const entry of fuzzyEntries) {
      if (!seen.has(entry.text)) {
        merged.push(entry);
        seen.add(entry.text);
      }
    }

    const matchingGit = gitOpts.filter(o => o.text.startsWith('@' + partial));
    return [...matchingGit, ...merged].slice(0, 30);
  }

  private getFileEntries(partial: string): Suggestion[] {
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

      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return [];
      }

      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const ignore = ['node_modules', '.git', 'dist', 'coverage', '.next', '__pycache__', '.cache'];

      return entries
        .filter(e => !ignore.includes(e.name))
        .filter(e => !e.name.startsWith('.') || partial.startsWith('.') || prefix.startsWith('.'))
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
        .slice(0, 30);
    } catch {
      return [];
    }
  }

  private getFuzzyFileEntries(partial: string): Suggestion[] {
    if (!partial || partial.length < 2) return [];

    try {
      const cwd = process.cwd();
      const ignore = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '__pycache__', '.cache']);
      const results: Suggestion[] = [];
      const needle = partial.toLowerCase();

      const searchDir = (dir: string, relPrefix: string, depth: number) => {
        if (depth > 2 || results.length >= 30) return;

        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(path.resolve(cwd, dir), { withFileTypes: true });
        } catch {
          return;
        }

        for (const e of entries) {
          if (results.length >= 30) break;
          if (ignore.has(e.name) || (e.name.startsWith('.') && !partial.startsWith('.'))) continue;

          const rel = relPrefix ? relPrefix + '/' + e.name : e.name;
          const isDir = e.isDirectory();

          if (e.name.toLowerCase().includes(needle)) {
            results.push({
              text: '@' + rel + (isDir ? '/' : ''),
              display: '@' + rel + (isDir ? '/' : ''),
              description: isDir ? 'dir' : '',
            });
          }

          if (isDir) {
            searchDir(rel, rel, depth + 1);
          }
        }
      };

      searchDir('.', '', 0);
      return results;
    } catch {
      return [];
    }
  }

  private handleCancel() {
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

  private handleExit() {
    process.stdout.write(`${Colors.dim}  Goodbye!${Colors.reset}\r\n`);
    process.exit(0);
  }

  private async handleLine(input: string) {
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

  private async handleCommand(command: string) {
    const parts = command.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':       this.printHelp(); break;
      case 'clear':      this.cmdClear(); break;
      case 'exit':
      case 'quit':       process.exit(0);
      case 'compact':    this.deepAgent.clearHistory(); process.stdout.write(`${Colors.green}  History compacted${Colors.reset}\r\n`); break;
      case 'status':     this.runGit('git status'); break;
      case 'diff':       this.runGit(args.length ? `git diff ${args.join(' ')}` : 'git diff'); break;
      case 'log':        this.runGit('git log --oneline -15'); break;
      case 'commit':     await this.cmdCommit(args); break;
      case 'up':         await this.cmdUp(); break;
      case 'split-up':   await this.cmdSplitUp(); break;
      case 'pr':         await this.cmdPr(); break;
      case 'review':     await this.cmdReview(args); break;
      case 'fix':        await this.cmdFix(args); break;
      case 'ident':      await this.cmdIdent(); break;
      case 'release':    await this.cmdRelease(args); break;
      case 'tools':      this.cmdTools(); break;
      case 'agents':     await this.cmdAgents(args); break;
      case 'skills':     await this.cmdSkills(args); break;
      case 'context':    this.cmdContext(); break;
      case 'mentions':   this.cmdMentionsHelp(); break;
      case 'model':      this.cmdModel(args); break;
      case 'config':     this.cmdConfig(); break;
      case 'init':       this.cmdInit(); break;
      case 'mcp':        await this.cmdMcp(args); break;

      default:
        process.stdout.write(`${Colors.red}  Unknown: /${cmd}${Colors.reset}  ${Colors.dim}Type /help${Colors.reset}\r\n`);
    }
  }

  private async handleMessage(message: string) {
    this.isProcessing = true;
    this.abortController = new AbortController();
    this.smartInput?.enterPassiveMode();

    try {
      const planCheck = await this.planModeService.shouldEnterPlanMode(message);
      if (planCheck.shouldPlan) {
        const usePlan = await this.smartInput!.askChoice(
          `📝 This looks complex. Create a plan first?`,
          [
            { key: 'y', label: 'yes', description: 'Create structured plan' },
            { key: 'n', label: 'no', description: 'Proceed without plan' },
          ]
        );
        
        if (usePlan === 'y') {
          await this.cmdPlan(message);
          return;
        }
      }

      const mentionResult = await this.mentionsService.processMessage(message);

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
      let isMarkdownRendered = false;

      for await (const chunk of this.deepAgent.chat(mentionResult.expandedMessage)) {
        if (this.abortController?.signal.aborted) break;

        const isToolOutput = chunk.includes('\x1b[') && (
          chunk.includes('\u23bf') || // tool icon
          chunk.includes('tokens:') || // token count
          chunk.includes('conversation compacted')
        );

        if (firstChunk && !isToolOutput) {
          this.stopSpinner();
          process.stdout.write(`\r\n${Colors.magenta}${Colors.bold}Cast${Colors.reset}\r\n`);
          firstChunk = false;
          isMarkdownRendered = true;
        }

        if (isToolOutput) {
          process.stdout.write(chunk);
        } else if (chunk.includes('\n') && isMarkdownRendered) {
          fullResponse += chunk;
        } else if (isMarkdownRendered) {
          fullResponse += chunk;
        } else {
          process.stdout.write(chunk);
        }
      }

      if (fullResponse.trim() && isMarkdownRendered) {
        const rendered = this.markdownRenderer.render(fullResponse);
        const lines = rendered.split('\n');
        for (const line of lines) {
          process.stdout.write(`  ${line}\r\n`);
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
        process.stdout.write(`\r\n${Colors.red}  Error: ${msg}${Colors.reset}\r\n\r\n`);
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      this.smartInput?.exitPassiveMode();
    }
  }

  private startSpinner(label: string) {
    let i = 0;
    this.spinnerTimer = setInterval(() => {
      process.stdout.write(`\r${Colors.cyan}${Icons.spinner[i++ % Icons.spinner.length]}${Colors.reset} ${Colors.dim}${label}...${Colors.reset}`);
    }, 80);
  }

  private stopSpinner() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
      process.stdout.write('\r\x1b[K');
    }
  }

  private showToolOutputs() {
    const outputs = this.deepAgent.getLastToolOutputs();
    if (outputs.length === 0) {
      process.stdout.write(`${Colors.dim}  No tool outputs from last interaction${Colors.reset}\r\n`);
      return;
    }
    process.stdout.write(`${Colors.cyan}${Colors.bold}  Tool Outputs${Colors.reset}\r\n`);
    for (const { tool, output } of outputs) {
      process.stdout.write(`\r\n${Colors.cyan}  \u2500\u2500 ${tool} \u2500\u2500${Colors.reset}\r\n`);
      const lines = output.split('\n');
      for (const line of lines) {
        process.stdout.write(`  ${line}\r\n`);
      }
    }
    process.stdout.write('\r\n');
  }

  private cmdClear() {
    this.deepAgent.clearHistory();
    process.stdout.write('\x1b[2J\x1b[H');
    this.welcomeScreenService.printBanner();
    process.stdout.write(`${Colors.green}  Conversation cleared${Colors.reset}\r\n`);
  }

  private async cmdCommit(args: string[]) {
    const msg = args.join(' ');
    if (!msg) {
      await this.handleMessage(
        'Create a git commit for the current staged changes. Review git diff --staged first and write a concise commit message.',
      );
    } else {
      this.runGit(`git add -A && git commit -m "${msg.replace(/"/g, '\\"')}"`);
    }
  }

  private async cmdUp() {
    const w = (s: string) => process.stdout.write(s);
    
    if (!this.commitGenerator.hasChanges()) {
      w(`${Colors.yellow}  No changes to commit${Colors.reset}\r\n\r\n`);
      return;
    }

    const monorepoInfo = this.monorepoDetector.detectMonorepo(process.cwd());
    if (monorepoInfo.isMonorepo) {
      w(`\r\n${Colors.dim}Monorepo detected: ${monorepoInfo.modules.join(', ')}${Colors.reset}\r\n`);
    }

    w(`\r\n${Colors.cyan}🤖 Analyzing changes...${Colors.reset}\r\n`);
    this.startSpinner('Generating commit message');

    try {
      const message = await this.commitGenerator.generateCommitMessage();
      this.stopSpinner();

      if (!message) {
        w(`${Colors.red}  Failed to generate commit message${Colors.reset}\r\n\r\n`);
        return;
      }

      w(`\r\n${Colors.green}✓ Generated commit message:${Colors.reset}\r\n`);
      w(`  ${Colors.cyan}${message}${Colors.reset}\r\n\r\n`);

      const confirm = await this.smartInput!.askChoice('Confirm and push?', [
        { key: 'y', label: 'yes', description: 'Commit and push' },
        { key: 'n', label: 'no', description: 'Cancel' },
        { key: 'e', label: 'edit', description: 'Edit message' },
      ]);

      if (confirm === 'n') {
        w(`${Colors.dim}  Cancelled${Colors.reset}\r\n\r\n`);
        return;
      }

      let finalMessage = message;

      if (confirm === 'e') {
        const userInstruction = await this.smartInput!.question(`${Colors.cyan}  Instructions for the LLM (e.g., "mention the git module changes"):${Colors.reset}`);
        if (!userInstruction.trim()) {
          w(`${Colors.dim}  Cancelled${Colors.reset}\r\n\r\n`);
          return;
        }
        
        w(`\r\n${Colors.cyan}🤖 Regenerating with your instructions...${Colors.reset}\r\n`);
        this.startSpinner('Refining commit message');
        
        const refinedMessage = await this.commitGenerator.refineCommitMessage(
          message,
          userInstruction.trim(),
          this.commitGenerator.getDiffInfo()!,
        );
        
        this.stopSpinner();
        
        w(`\r\n${Colors.green}✓ Refined commit message:${Colors.reset}\r\n`);
        w(`  ${Colors.cyan}${refinedMessage}${Colors.reset}\r\n\r\n`);
        
        const confirmRefined = await this.smartInput!.askChoice('Use this message?', [
          { key: 'y', label: 'yes', description: 'Commit and push' },
          { key: 'n', label: 'no', description: 'Cancel' },
        ]);
        
        if (confirmRefined === 'n') {
          w(`${Colors.dim}  Cancelled${Colors.reset}\r\n\r\n`);
          return;
        }
        
        finalMessage = refinedMessage;
      }

      w(`\r\n${Colors.dim}  Committing...${Colors.reset}\r\n`);
      const success = this.commitGenerator.executeCommit(finalMessage, true);

      if (!success) {
        w(`${Colors.red}  ✗ Commit failed${Colors.reset}\r\n\r\n`);
        return;
      }

      w(`${Colors.green}  ✓ Committed:${Colors.reset} ${finalMessage}\r\n`);

      w(`\r\n${Colors.dim}  Pushing...${Colors.reset}\r\n`);
      const pushResult = this.commitGenerator.executePush();

      if (pushResult.success) {
        w(`${Colors.green}  ✓ Pushed successfully${Colors.reset}\r\n\r\n`);
      } else {
        w(`${Colors.red}  ✗ Push failed:${Colors.reset} ${pushResult.error}\r\n\r\n`);
      }

    } catch (error: any) {
      this.stopSpinner();
      w(`${Colors.red}  Error: ${error.message}${Colors.reset}\r\n\r\n`);
    }
  }

  private async cmdSplitUp() {
    const w = (s: string) => process.stdout.write(s);
    
    if (!this.commitGenerator.hasChanges()) {
      w(`${Colors.yellow}  No changes to commit${Colors.reset}\r\n\r\n`);
      return;
    }

    const monorepoInfo = this.monorepoDetector.detectMonorepo(process.cwd());
    if (monorepoInfo.isMonorepo) {
      w(`\r\n${Colors.dim}Monorepo detected: ${monorepoInfo.modules.join(', ')}${Colors.reset}\r\n`);
    }

    w(`\r\n${Colors.cyan}🤖 Analyzing changes for split...${Colors.reset}\r\n`);
    this.startSpinner('Splitting into logical commits');

    try {
      const commits = await this.commitGenerator.splitCommits();
      this.stopSpinner();

      if (!commits || commits.length === 0) {
        w(`${Colors.red}  Failed to split commits${Colors.reset}\r\n\r\n`);
        return;
      }

      w(`\r\n${Colors.green}✓ Proposed ${commits.length} commits:${Colors.reset}\r\n\r\n`);

      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i];
        w(`  ${Colors.cyan}${i + 1}.${Colors.reset} ${commit.message}\r\n`);
        w(`     ${Colors.dim}Files: ${commit.files.join(', ')}${Colors.reset}\r\n`);
      }

      w(`\r\n`);

      const confirm = await this.smartInput!.askChoice('Execute these commits?', [
        { key: 'y', label: 'yes', description: `Commit all ${commits.length} changes` },
        { key: 'n', label: 'no', description: 'Cancel' },
      ]);

      if (confirm !== 'y') {
        w(`${Colors.dim}  Cancelled${Colors.reset}\r\n\r\n`);
        return;
      }

      w(`\r\n${Colors.dim}  Executing commits...${Colors.reset}\r\n`);
      const result = this.commitGenerator.executeSplitCommits(commits);

      if (result.success) {
        w(`${Colors.green}  ✓ ${result.committed} commits executed${Colors.reset}\r\n`);

        w(`\r\n${Colors.dim}  Pushing...${Colors.reset}\r\n`);
        const pushResult = this.commitGenerator.executePush();

        if (pushResult.success) {
          w(`${Colors.green}  ✓ Pushed successfully${Colors.reset}\r\n\r\n`);
        } else {
          w(`${Colors.red}  ✗ Push failed:${Colors.reset} ${pushResult.error}\r\n\r\n`);
        }
      } else {
        w(`${Colors.red}  ✗ Failed:${Colors.reset} ${result.error}\r\n\r\n`);
      }

    } catch (error: any) {
      this.stopSpinner();
      w(`${Colors.red}  Error: ${error.message}${Colors.reset}\r\n\r\n`);
    }
  }

  private async cmdPr() {
    const w = (s: string) => process.stdout.write(s);
    
    const branch = this.prGenerator.getCurrentBranch();
    if (branch === 'main' || branch === 'master' || branch === 'develop') {
      w(`${Colors.yellow}  Cannot create PR from ${branch} branch${Colors.reset}\r\n\r\n`);
      return;
    }

    const detectedBase = this.prGenerator.detectDefaultBaseBranch();
    const baseBranchInput = await this.smartInput!.question(
      `${Colors.cyan}  Base branch (default: ${detectedBase}):${Colors.reset}`
    );
    const baseBranch = baseBranchInput.trim() || detectedBase;

    w(`\r\n${Colors.cyan}🔍 Analyzing commits in ${branch}...${Colors.reset}\r\n`);
    this.startSpinner('Fetching commit history');

    const commits = this.prGenerator.getCommitsNotInBase(baseBranch);
    this.stopSpinner();

    if (commits.length === 0) {
      w(`${Colors.yellow}  No commits found between ${branch} and ${baseBranch}${Colors.reset}\r\n\r\n`);
      return;
    }

    w(`\r\n${Colors.green}✓ Found ${commits.length} commit(s) to analyze:${Colors.reset}\r\n`);
    for (const commit of commits) {
      w(`  ${Colors.dim}${commit.hash}${Colors.reset} ${commit.message.slice(0, 50)}${commit.message.length > 50 ? '...' : ''}\r\n`);
    }
    w(`\r\n`);

    w(`${Colors.cyan}🤖 Generating PR description with AI agents...${Colors.reset}\r\n`);
    this.startSpinner('Analyzing commits in parallel');

    try {
      const prDescription = await this.prGenerator.generatePRDescription(branch, commits, baseBranch);
      this.stopSpinner();

      w(`\r\n${Colors.bold}${'─'.repeat(60)}${Colors.reset}\r\n`);
      w(`${Colors.bold}Pull Request Preview:${Colors.reset}\r\n`);
      w(`${Colors.bold}${'─'.repeat(60)}${Colors.reset}\r\n\r\n`);
      
      w(`${Colors.bold}Title:${Colors.reset}\r\n`);
      w(`  ${Colors.cyan}${prDescription.title}${Colors.reset}\r\n\r\n`);
      
      w(`${Colors.bold}Description:${Colors.reset}\r\n`);
      const descLines = prDescription.description.split('\n');
      for (const line of descLines.slice(0, 30)) {
        w(`  ${line}\r\n`);
      }
      if (descLines.length > 30) {
        w(`  ${Colors.dim}... (${descLines.length - 30} more lines)${Colors.reset}\r\n`);
      }
      
      w(`\r\n${Colors.bold}Commits Analysis:${Colors.reset}\r\n`);
      for (const commit of prDescription.commits) {
        w(`  ${Colors.dim}${commit.hash}${Colors.reset} ${Colors.cyan}${commit.summary.slice(0, 60)}${commit.summary.length > 60 ? '...' : ''}${Colors.reset}\r\n`);
      }
      
      w(`\r\n${Colors.bold}${'─'.repeat(60)}${Colors.reset}\r\n\r\n`);

      const confirm = await this.smartInput!.askChoice('Create this PR?', [
        { key: 'y', label: 'yes', description: 'Create PR on GitHub' },
        { key: 'n', label: 'no', description: 'Cancel' },
        { key: 'e', label: 'edit', description: 'Edit title/description' },
      ]);

      if (confirm === 'n') {
        w(`${Colors.dim}  Cancelled${Colors.reset}\r\n\r\n`);
        return;
      }

      let finalTitle = prDescription.title;
      let finalDescription = prDescription.description;

      if (confirm === 'e') {
        const newTitle = await this.smartInput!.question(
          `${Colors.cyan}  Title (leave empty to keep current):${Colors.reset}`
        );
        if (newTitle.trim()) {
          finalTitle = newTitle.trim();
        }

        w(`${Colors.dim}  Current description saved. Use 'e' to edit in your editor${Colors.reset}\r\n`);
        const editDesc = await this.smartInput!.askChoice('Edit description?', [
          { key: 'y', label: 'yes', description: 'Edit in default editor' },
          { key: 'n', label: 'no', description: 'Keep as is' },
        ]);

        if (editDesc === 'y') {
          const tempFile = `/tmp/pr-desc-${Date.now()}.md`;
          require('fs').writeFileSync(tempFile, finalDescription);
          
          const editor = process.env.EDITOR || 'nano';
          try {
            execSync(`${editor} "${tempFile}"`, { stdio: 'inherit' });
            finalDescription = require('fs').readFileSync(tempFile, 'utf-8');
          } catch {
            w(`${Colors.yellow}  Could not open editor. Keeping original description.${Colors.reset}\r\n`);
          } finally {
            try {
              require('fs').unlinkSync(tempFile);
            } catch {}
          }
        }
      }

      const { platform } = this.prGenerator.detectPlatform();
      if (platform !== 'github') {
        w(`\r\n${Colors.yellow}  ⚠️  Platform detected: ${platform}${Colors.reset}\r\n`);
        w(`${Colors.dim}  Automatic PR creation only supported for GitHub.${Colors.reset}\r\n`);
        w(`${Colors.dim}  Generating description for manual copy...${Colors.reset}\r\n\r\n`);
      }

      w(`${Colors.dim}  ${platform === 'github' ? 'Creating PR on GitHub...' : 'Preparing description...'}${Colors.reset}\r\n`);
      this.startSpinner(platform === 'github' ? 'Pushing branch and creating PR' : 'Formatting description');

      if (platform === 'github') {
        try {
          execSync(`git push origin ${branch}`, { cwd: process.cwd(), encoding: 'utf-8' });
        } catch {
        }
      }

      const result = await this.prGenerator.createPR(finalTitle, finalDescription, baseBranch);
      this.stopSpinner();

      if (result.success && result.url) {
        w(`\r\n${Colors.green}  ✓ Pull Request created!${Colors.reset}\r\n`);
        w(`  ${Colors.cyan}${result.url}${Colors.reset}\r\n`);
        w(`\r\n`);
      } else {
        if (result.error) {
          w(`\r\n${Colors.yellow}  ${result.error}${Colors.reset}\r\n`);
        }
        
        if (result.description) {
          const copied = this.prGenerator.copyToClipboard(result.description);
          
          w(`\r\n${Colors.bold}${'─'.repeat(60)}${Colors.reset}\r\n`);
          w(`${Colors.bold}PR Description (copy manually if needed):${Colors.reset}\r\n`);
          w(`${Colors.bold}${'─'.repeat(60)}${Colors.reset}\r\n\r\n`);
          
          const descLines = result.description.split('\n');
          for (const line of descLines) {
            w(`${line}\r\n`);
          }
          
          w(`\r\n${Colors.bold}${'─'.repeat(60)}${Colors.reset}\r\n`);
          
          if (copied) {
            w(`${Colors.green}  ✓ Description copied to clipboard!${Colors.reset}\r\n`);
          } else {
            w(`${Colors.yellow}  ⚠️  Could not copy to clipboard automatically${Colors.reset}\r\n`);
            w(`${Colors.dim}  Please copy the description above manually${Colors.reset}\r\n`);
          }
          
          const createUrl = this.prGenerator.getPRCreateUrl(platform, baseBranch);
          if (createUrl) {
            w(`\r\n${Colors.dim}  Open this URL to create the PR:${Colors.reset}\r\n`);
            w(`  ${Colors.cyan}${createUrl}${Colors.reset}\r\n`);
          }
          
          w(`\r\n`);
        }
      }

    } catch (error: any) {
      this.stopSpinner();
      w(`\r\n${Colors.red}  Error: ${error.message}${Colors.reset}\r\n\r\n`);
    }
  }

  private async cmdReview(args: string[]) {
    const w = (s: string) => process.stdout.write(s);
    
    let files: string[] = [];
    
    if (args.length > 0) {
      files = args.filter(a => !a.startsWith('/'));
    } else {
      w(`\r\n${Colors.cyan}🔍 Analyzing staged files...${Colors.reset}\r\n`);
      const diffFiles = this.codeReviewService['getChangedFiles'](true);
      files = diffFiles;
    }
    
    if (files.length === 0) {
      w(`${Colors.yellow}  No files to review${Colors.reset}\r\n\r\n`);
      return;
    }
    
    w(`\r\n${Colors.cyan}🤖 Reviewing ${files.length} file(s)...${Colors.reset}\r\n`);
    this.startSpinner('Analyzing code');
    
    try {
      const results = await this.codeReviewService.reviewFiles(files);
      this.stopSpinner();
      
      let totalIssues = 0;
      let totalScore = 0;
      
      for (const result of results) {
        totalScore += result.score;
        const errors = result.issues.filter(i => i.severity === 'error').length;
        const warnings = result.issues.filter(i => i.severity === 'warning').length;
        const suggestions = result.issues.filter(i => i.severity === 'suggestion').length;
        
        totalIssues += result.issues.length;
        
        const scoreColor = result.score >= 80 ? Colors.green : result.score >= 60 ? Colors.yellow : Colors.red;
        
        w(`\r\n${Colors.bold}${result.file}${Colors.reset} ${scoreColor}${result.score}/100${Colors.reset}\r\n`);
        w(`  ${result.summary}\r\n`);
        
        if (errors > 0) w(`  ${Colors.red}✗ ${errors} errors${Colors.reset}  `);
        if (warnings > 0) w(`${Colors.yellow}⚠ ${warnings} warnings${Colors.reset}  `);
        if (suggestions > 0) w(`${Colors.dim}💡 ${suggestions} suggestions${Colors.reset}`);
        if (errors > 0 || warnings > 0 || suggestions > 0) w('\r\n');
        
        const topIssues = result.issues.filter(i => i.severity !== 'praise').slice(0, 3);
        for (const issue of topIssues) {
          const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : '💡';
          const color = issue.severity === 'error' ? Colors.red : issue.severity === 'warning' ? Colors.yellow : Colors.dim;
          const line = issue.line ? `:${issue.line}` : '';
          w(`  ${color}${icon}${Colors.reset} ${issue.message}${line}\r\n`);
        }
        
        if (result.issues.length > 3) {
          w(`  ${Colors.dim}... and ${result.issues.length - 3} more${Colors.reset}\r\n`);
        }
      }
      
      const avgScore = Math.round(totalScore / results.length);
      const avgColor = avgScore >= 80 ? Colors.green : avgScore >= 60 ? Colors.yellow : Colors.red;
      
      w(`\r\n${Colors.bold}Summary:${Colors.reset} ${avgColor}${avgScore}/100${Colors.reset} | ${totalIssues} issue(s) found\r\n\r\n`);
      
    } catch (error: any) {
      this.stopSpinner();
      w(`${Colors.red}  Error: ${error.message}${Colors.reset}\r\n\r\n`);
    }
  }

  private async cmdFix(args: string[]) {
    const w = (s: string) => process.stdout.write(s);
    
    if (args.length === 0) {
      w(`${Colors.yellow}  Usage: /fix <file>${Colors.reset}\r\n\r\n`);
      return;
    }
    
    const filePath = args[0];
    
    w(`\r\n${Colors.cyan}🔧 Fixing ${filePath}...${Colors.reset}\r\n`);
    this.startSpinner('Analyzing and fixing');
    
    try {
      const result = await this.codeReviewService.fixFile(filePath);
      this.stopSpinner();
      
      if (result.success) {
        w(`${Colors.green}  ✓ File fixed successfully${Colors.reset}\r\n\r\n`);
      } else {
        w(`${Colors.red}  ✗ Failed to fix: ${result.error}${Colors.reset}\r\n\r\n`);
      }
    } catch (error: any) {
      this.stopSpinner();
      w(`${Colors.red}  Error: ${error.message}${Colors.reset}\r\n\r\n`);
    }
  }

  private async cmdIdent() {
    const w = (s: string) => process.stdout.write(s);
    
    w(`\r\n${Colors.cyan}🎨 Formatting all code files...${Colors.reset}\r\n`);
    this.startSpinner('Formatting');
    
    try {
      const result = await this.codeReviewService.indentAll();
      this.stopSpinner();
      
      w(`${Colors.green}  ✓ ${result.success} file(s) formatted${Colors.reset}\r\n`);
      if (result.failed > 0) {
        w(`${Colors.yellow}  ⚠ ${result.failed} file(s) failed${Colors.reset}\r\n`);
      }
      w(`\r\n`);
    } catch (error: any) {
      this.stopSpinner();
      w(`${Colors.red}  Error: ${error.message}${Colors.reset}\r\n\r\n`);
    }
  }

  private async cmdRelease(args: string[]) {
    const w = (s: string) => process.stdout.write(s);
    
    w(`\r\n${Colors.cyan}📝 Generating release notes...${Colors.reset}\r\n`);
    this.startSpinner('Analyzing commits and generating');
    
    try {
      const sinceTag = args[0];
      const result = await this.releaseNotesService.generateReleaseNotes(sinceTag);
      
      this.stopSpinner();
      
      if (result.success && result.filePath) {
        w(`${Colors.green}  ✓ Release notes generated!${Colors.reset}\r\n`);
        w(`  ${Colors.dim}${result.filePath}${Colors.reset}\r\n\r\n`);
        
        if (result.content) {
          w(`${Colors.bold}Preview:${Colors.reset}\r\n`);
          const lines = result.content.split('\n').slice(0, 15);
          for (const line of lines) {
            w(`  ${line}\r\n`);
          }
          if (result.content.split('\n').length > 15) {
            w(`  ${Colors.dim}...${Colors.reset}\r\n`);
          }
          w(`\r\n`);
        }
      } else {
        w(`${Colors.red}  ✗ Failed: ${result.error}${Colors.reset}\r\n\r\n`);
      }
    } catch (error: any) {
      this.stopSpinner();
      w(`${Colors.red}  Error: ${error.message}${Colors.reset}\r\n\r\n`);
    }
  }

  private async cmdPlan(message: string) {
    const w = (s: string) => process.stdout.write(s);
    
    w(`\r\n${Colors.cyan}📝 Creating plan...${Colors.reset}\r\n`);
    this.startSpinner('Analyzing request');
    
    try {
      const plan = await this.planModeService.generatePlan(message);
      this.stopSpinner();
      
      const formattedPlan = this.planModeService.formatPlanForDisplay(plan);
      w(formattedPlan);
      
      const action = await this.smartInput!.askChoice('Proceed with this plan?', [
        { key: 'y', label: 'yes', description: 'Execute plan step by step' },
        { key: 'e', label: 'edit', description: 'Modify plan' },
        { key: 'n', label: 'no', description: 'Cancel' },
      ]);
      
      if (action === 'n') {
        w(`${Colors.dim}  Cancelled${Colors.reset}\r\n\r\n`);
        return;
      }
      
      if (action === 'e') {
        const feedback = await this.smartInput!.question(`${Colors.cyan}What would you like to change?${Colors.reset}`);
        if (feedback.trim()) {
          w(`\r\n${Colors.cyan}📝 Updating plan...${Colors.reset}\r\n`);
          this.startSpinner('Refining plan');
          
          const refinedPlan = await this.planModeService.refinePlan(plan, feedback.trim());
          this.stopSpinner();
          
          w(this.planModeService.formatPlanForDisplay(refinedPlan));
          
          const confirm = await this.smartInput!.askChoice('Proceed with updated plan?', [
            { key: 'y', label: 'yes', description: 'Execute plan' },
            { key: 'n', label: 'no', description: 'Cancel' },
          ]);
          
          if (confirm !== 'y') {
            w(`${Colors.dim}  Cancelled${Colors.reset}\r\n\r\n`);
            return;
          }
        }
      }
      
      w(`\r\n${Colors.green}🚀 Executing plan...${Colors.reset}\r\n\r\n`);
      
      for (const step of plan.steps) {
        w(`${Colors.cyan}Step ${step.id}:${Colors.reset} ${step.description}\r\n`);
        if (step.files.length > 0) {
          w(`  Files: ${step.files.join(', ')}\r\n`);
        }
        
        const stepAction = await this.smartInput!.askChoice('Execute this step?', [
          { key: 'y', label: 'yes', description: 'Execute' },
          { key: 's', label: 'skip', description: 'Skip this step' },
          { key: 'q', label: 'quit', description: 'Stop execution' },
        ]);
        
        if (stepAction === 'q') {
          w(`${Colors.dim}  Plan execution stopped${Colors.reset}\r\n\r\n`);
          return;
        }
        
        if (stepAction === 's') {
          w(`${Colors.dim}  Skipped${Colors.reset}\r\n\r\n`);
          continue;
        }
        
        const stepPrompt = `Execute this plan step:\n\n${step.description}\n\nFiles involved: ${step.files.join(', ')}\n\nMake the necessary changes.`;
        
        this.isProcessing = true;
        let firstChunk = true;
        let fullResponse = '';
        
        for await (const chunk of this.deepAgent.chat(stepPrompt)) {
          if (this.abortController?.signal.aborted) break;
          
          if (firstChunk) {
            w(`\r\n${Colors.magenta}${Colors.bold}Cast${Colors.reset}\r\n`);
            firstChunk = false;
          }
          
          fullResponse += chunk;
          w(chunk);
        }
        
        w(`\r\n${Colors.green}  ✓ Step completed${Colors.reset}\r\n\r\n`);
      }
      
      w(`${Colors.green}✓ Plan execution completed!${Colors.reset}\r\n\r\n`);
      
    } catch (error: any) {
      this.stopSpinner();
      w(`${Colors.red}  Error: ${error.message}${Colors.reset}\r\n\r\n`);
    }
  }

  private cmdTools() {
    const builtIn = [
      ['read_file',        'Read file contents'],
      ['write_file',       'Write/create files'],
      ['edit_file',        'Edit files (string replace)'],
      ['glob',             'Find files by pattern'],
      ['grep',             'Search file contents'],
      ['ls',               'List directory'],
      ['shell',            'Execute commands'],
      ['shell_background', 'Background commands'],
      ['web_search',       'Web search'],
      ['web_fetch',        'Fetch URL content'],
      ['task_create',      'Create task'],
      ['task_update',      'Update task'],
      ['task_list',        'List tasks'],
      ['task_get',         'Get task details'],
      ['ask_user_question','Ask user for input'],
      ['enter_plan_mode',  'Start planning mode'],
      ['exit_plan_mode',   'Submit plan'],
      ['memory_write',     'Save to memory'],
      ['memory_read',      'Read from memory'],
      ['memory_search',    'Search memory'],
    ];

    const max = Math.max(...builtIn.map(([n]) => n.length));
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(colorize(Icons.tool + ' ', 'accent') + colorize(`Built-in Tools (${builtIn.length})`, 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(25), 'subtle') + '\r\n');
    
    for (const [name, desc] of builtIn) {
      const paddedName = name.padEnd(max);
      w(`  ${colorize(paddedName, 'cyan')}  ${colorize(desc, 'muted')}\r\n`);
    }

    const mcpTools = this.mcpRegistry.getAllMcpTools();
    if (mcpTools.length > 0) {
      w('\r\n');
      w(colorize(Icons.cloud + ' ', 'accent') + colorize(`MCP Tools (${mcpTools.length})`, 'bold') + '\r\n');
      w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n');
      
      for (const t of mcpTools) {
        w(`  ${colorize(t.name, 'cyan')}  ${colorize(t.description, 'muted')}\r\n`);
      }
    }
    w('\r\n');
  }

  private async cmdAgents(args: string[]) {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const agents = this.agentRegistry.resolveAllAgents();
      w(`\r\n${Colors.bold}Agents (${agents.length}):${Colors.reset}\r\n`);

      if (agents.length === 0) {
        w(`  ${Colors.dim}No agents loaded.${Colors.reset}\r\n`);
        w(`  ${Colors.dim}Create one with /agents create or add .md files to .cast/definitions/agents/${Colors.reset}\r\n`);
      } else {
        const maxName = Math.max(...agents.map(a => a.name.length));
        for (const a of agents) {
          const toolNames = (a.tools as any[]).map((t: any) => t.name).join(', ');
          const toolsInfo = toolNames ? ` ${Colors.dim}[${toolNames}]${Colors.reset}` : '';
          w(`  ${Colors.cyan}${a.name}${Colors.reset}${' '.repeat(maxName - a.name.length + 2)}${Colors.dim}${a.description}${Colors.reset}${toolsInfo}\r\n`);
        }
      }
      w(`\r\n  ${Colors.dim}/agents <name> - agent details  |  /agents create - new agent${Colors.reset}\r\n\r\n`);
      return;
    }

    if (sub === 'create') {
      await this.createAgentWizard();
      return;
    }

    const agent = this.agentRegistry.resolveAgent(sub);
    if (agent) {
      const toolNames = (agent.tools as any[]).map((t: any) => t.name);
      w(`\r\n${Colors.bold}Agent: ${Colors.cyan}${agent.name}${Colors.reset}\r\n`);
      w(`  ${Colors.dim}Description:${Colors.reset} ${agent.description}\r\n`);
      w(`  ${Colors.dim}Model:${Colors.reset}       ${agent.model}\r\n`);
      w(`  ${Colors.dim}Tools (${toolNames.length}):${Colors.reset}  ${toolNames.length > 0 ? toolNames.join(', ') : 'none'}\r\n`);
      w(`  ${Colors.dim}MCP:${Colors.reset}         ${agent.mcp.length > 0 ? agent.mcp.join(', ') : 'none'}\r\n\r\n`);
    } else {
      w(`${Colors.red}  Agent "${sub}" not found${Colors.reset}\r\n`);
    }
  }

  private async createAgentWizard() {
    const castDir = path.join(process.cwd(), '.cast', 'definitions', 'agents');
    if (!fs.existsSync(castDir)) fs.mkdirSync(castDir, { recursive: true });

    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${Colors.bold}  Create New Agent${Colors.reset}\r\n\r\n`);

    const name = await this.smartInput!.question(`${Colors.cyan}  Name:${Colors.reset}`);
    if (!name.trim()) { w(`${Colors.red}  Cancelled${Colors.reset}\r\n`); return; }

    const description = await this.smartInput!.question(`${Colors.cyan}  Description:${Colors.reset}`);
    const skillsInput = await this.smartInput!.question(`${Colors.cyan}  Skills (comma-separated, or empty):${Colors.reset}`);
    const skills = skillsInput.trim()
      ? skillsInput.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const content = [
      '---',
      `name: ${name.trim()}`,
      `description: "${description.trim()}"`,
      skills.length > 0 ? `skills: [${skills.map(s => `"${s}"`).join(', ')}]` : 'skills: []',
      'mcp: []',
      '---',
      '',
      '# System Prompt',
      '',
      `You are ${name.trim()}, a specialized AI assistant.`,
      description.trim() ? `Your specialty: ${description.trim()}.` : '',
      '',
      'Follow the project conventions and be helpful.',
      '',
    ].join('\n');

    const filename = `${name.trim().toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(castDir, filename);
    fs.writeFileSync(filePath, content);

    w(`\r\n${Colors.green}  Agent created: ${filePath}${Colors.reset}\r\n`);
    w(`${Colors.dim}  Edit the file to customize the system prompt${Colors.reset}\r\n`);
    w(`${Colors.dim}  Restart to load the new agent${Colors.reset}\r\n\r\n`);
  }

  private async cmdSkills(args: string[]) {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const skills = this.skillRegistry.getAllSkills();
      w(`\r\n${Colors.bold}Skills (${skills.length}):${Colors.reset}\r\n`);

      if (skills.length === 0) {
        w(`  ${Colors.dim}No skills loaded.${Colors.reset}\r\n`);
        w(`  ${Colors.dim}Create one with /skills create or add .md files to .cast/definitions/skills/${Colors.reset}\r\n`);
      } else {
        for (const s of skills) {
          w(`  ${Colors.cyan}${s.name}${Colors.reset}  ${Colors.dim}${s.description}${Colors.reset}  ${Colors.dim}[${s.tools.join(', ')}]${Colors.reset}\r\n`);
        }
      }
      w(`\r\n  ${Colors.dim}/skills create - create a new skill${Colors.reset}\r\n\r\n`);
      return;
    }

    if (sub === 'create') {
      await this.createSkillWizard();
      return;
    }

    w(`${Colors.red}  Unknown: /skills ${sub}${Colors.reset}\r\n`);
  }

  private async createSkillWizard() {
    const castDir = path.join(process.cwd(), '.cast', 'definitions', 'skills');
    if (!fs.existsSync(castDir)) fs.mkdirSync(castDir, { recursive: true });

    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${Colors.bold}  Create New Skill${Colors.reset}\r\n\r\n`);

    const name = await this.smartInput!.question(`${Colors.cyan}  Name:${Colors.reset}`);
    if (!name.trim()) { w(`${Colors.red}  Cancelled${Colors.reset}\r\n`); return; }

    const description = await this.smartInput!.question(`${Colors.cyan}  Description:${Colors.reset}`);

    w(`\r\n  ${Colors.dim}Available tools: read_file, write_file, edit_file, glob, grep, ls, shell, web_fetch${Colors.reset}\r\n`);
    const toolsInput = await this.smartInput!.question(`${Colors.cyan}  Tools (comma-separated):${Colors.reset}`);
    const tools = toolsInput.trim()
      ? toolsInput.split(',').map(t => t.trim()).filter(Boolean)
      : ['read_file', 'write_file', 'edit_file', 'glob', 'grep'];

    const content = [
      '---',
      `name: ${name.trim()}`,
      `description: "${description.trim()}"`,
      `tools: [${tools.map(t => `"${t}"`).join(', ')}]`,
      '---',
      '',
      '# Guidelines',
      '',
      `When using this skill, follow these guidelines:`,
      '',
      `1. ${description.trim() || 'Be helpful and follow conventions'}`,
      '',
    ].join('\n');

    const filename = `${name.trim().toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(castDir, filename);
    fs.writeFileSync(filePath, content);

    w(`\r\n${Colors.green}  Skill created: ${filePath}${Colors.reset}\r\n`);
    w(`${Colors.dim}  Edit the file to add guidelines${Colors.reset}\r\n`);
    w(`${Colors.dim}  Restart to load the new skill${Colors.reset}\r\n\r\n`);
  }

  private async cmdMcp(args: string[]) {
    const sub = args[0] || 'list';
    const w = (s: string) => process.stdout.write(s);

    switch (sub) {
      case 'list': {
        const summaries = this.mcpRegistry.getServerSummaries();
        w(`\r\n${Colors.bold}MCP Servers:${Colors.reset}\r\n`);
        if (summaries.length === 0) {
          w(`  ${Colors.dim}No MCP servers configured${Colors.reset}\r\n`);
          w(`  ${Colors.dim}Use /mcp add to connect one, or /mcp help for setup guide${Colors.reset}\r\n`);
        } else {
          for (const s of summaries) {
            const st = s.status === 'connected'
              ? `${Colors.green}connected${Colors.reset}`
              : `${Colors.red}${s.status}${Colors.reset}`;
            w(`  ${Colors.cyan}${s.name}${Colors.reset}: ${st} (${s.toolCount} tools)\r\n`);
          }
        }
        w('\r\n');
        break;
      }

      case 'tools': {
        const summaries = this.mcpRegistry.getServerSummaries();
        const totalTools = summaries.reduce((sum, s) => sum + s.toolCount, 0);
        if (totalTools === 0) {
          w(`  ${Colors.dim}No MCP tools available. Connect a server first with /mcp add${Colors.reset}\r\n`);
        } else {
          w(`\r\n${Colors.bold}MCP Tools (${totalTools}):${Colors.reset}\r\n`);
          for (const server of summaries) {
            if (server.toolCount === 0) continue;
            w(`\r\n  ${Colors.bold}${server.name}${Colors.reset} ${Colors.dim}(${server.transport}, ${server.status})${Colors.reset}\r\n`);
            for (const td of server.toolDescriptions) {
              w(`    ${Colors.cyan}${td.name}${Colors.reset}  ${Colors.dim}${td.description}${Colors.reset}\r\n`);
            }
          }
          w('\r\n');
        }
        break;
      }

      case 'add': {
        await this.addMcpWizard();
        break;
      }

      case 'help': {
        this.printMcpHelp();
        break;
      }

      default:
        w(`  ${Colors.dim}Usage: /mcp list | /mcp tools | /mcp add | /mcp help${Colors.reset}\r\n`);
    }
  }

  private printMcpHelp() {
    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${Colors.bold}MCP Setup Guide${Colors.reset}\r\n`);
    w(`${Colors.dim}${'─'.repeat(50)}${Colors.reset}\r\n\r\n`);

    w(`${Colors.bold}Step 1: Initialize project${Colors.reset}\r\n`);
    w(`  ${Colors.cyan}/init${Colors.reset}  ${Colors.dim}Creates .cast/ directory${Colors.reset}\r\n\r\n`);

    w(`${Colors.bold}Step 2: Add MCP server${Colors.reset}\r\n\r\n`);
    w(`  ${Colors.bold}Via wizard:${Colors.reset}\r\n`);
    w(`    ${Colors.cyan}/mcp add${Colors.reset}  ${Colors.dim}Interactive setup${Colors.reset}\r\n\r\n`);

    w(`  ${Colors.bold}Via JSON (stdio):${Colors.reset} ${Colors.dim}.cast/mcp/github.json${Colors.reset}\r\n`);
    w(`    ${Colors.dim}{${Colors.reset}\r\n`);
    w(`    ${Colors.dim}  "type": "stdio",${Colors.reset}\r\n`);
    w(`    ${Colors.dim}  "command": "npx",${Colors.reset}\r\n`);
    w(`    ${Colors.dim}  "args": ["-y", "@modelcontextprotocol/server-github"],${Colors.reset}\r\n`);
    w(`    ${Colors.dim}  "env": { "GITHUB_TOKEN": "ghp_xxx" }${Colors.reset}\r\n`);
    w(`    ${Colors.dim}}${Colors.reset}\r\n\r\n`);

    w(`  ${Colors.bold}Via JSON (http):${Colors.reset} ${Colors.dim}.cast/mcp/api.json${Colors.reset}\r\n`);
    w(`    ${Colors.dim}{${Colors.reset}\r\n`);
    w(`    ${Colors.dim}  "type": "http",${Colors.reset}\r\n`);
    w(`    ${Colors.dim}  "endpoint": "https://mcp.example.com/api",${Colors.reset}\r\n`);
    w(`    ${Colors.dim}  "env": { "AUTH_TOKEN": "bearer-token" }${Colors.reset}\r\n`);
    w(`    ${Colors.dim}}${Colors.reset}\r\n\r\n`);

    w(`${Colors.bold}Step 3: Link MCP to agents (optional)${Colors.reset}\r\n`);
    w(`  ${Colors.dim}In .cast/definitions/agents/frontend.md frontmatter:${Colors.reset}\r\n`);
    w(`    ${Colors.dim}mcp: [figma]${Colors.reset}\r\n\r\n`);

    w(`${Colors.bold}Step 4: Verify${Colors.reset}\r\n`);
    w(`  ${Colors.cyan}/mcp list${Colors.reset}   ${Colors.dim}See servers and status${Colors.reset}\r\n`);
    w(`  ${Colors.cyan}/mcp tools${Colors.reset}  ${Colors.dim}See available tools${Colors.reset}\r\n\r\n`);

    w(`${Colors.bold}Popular MCP Servers${Colors.reset}\r\n`);
    w(`  ${Colors.dim}@modelcontextprotocol/server-filesystem${Colors.reset}  ${Colors.dim}Local files${Colors.reset}\r\n`);
    w(`  ${Colors.dim}@modelcontextprotocol/server-github${Colors.reset}      ${Colors.dim}GitHub API${Colors.reset}\r\n`);
    w(`  ${Colors.dim}@anthropics/claude-code-mcp${Colors.reset}              ${Colors.dim}Claude Code${Colors.reset}\r\n`);
    w(`  ${Colors.dim}@modelcontextprotocol/server-postgres${Colors.reset}    ${Colors.dim}PostgreSQL${Colors.reset}\r\n\r\n`);
  }

  private async addMcpWizard() {
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');
    if (!fs.existsSync(mcpDir)) fs.mkdirSync(mcpDir, { recursive: true });

    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${Colors.bold}  Add MCP Server${Colors.reset}\r\n\r\n`);

    const name = await this.smartInput!.question(`${Colors.cyan}  Server name:${Colors.reset}`);
    if (!name.trim()) { w(`${Colors.red}  Cancelled${Colors.reset}\r\n`); return; }

    const typeChoice = await this.smartInput!.askChoice('  Transport type:', [
      { key: 'stdio', label: 'stdio', description: 'Local process (most common)' },
      { key: 'http',  label: 'http',  description: 'HTTP endpoint' },
      { key: 'sse',   label: 'sse',   description: 'Server-Sent Events' },
    ]);

    const config: Record<string, any> = { type: typeChoice };

    if (typeChoice === 'stdio') {
      const command = await this.smartInput!.question(`${Colors.cyan}  Command (e.g., npx -y @modelcontextprotocol/server-filesystem):${Colors.reset}`);
      const argsInput = await this.smartInput!.question(`${Colors.cyan}  Arguments (comma-separated, or empty):${Colors.reset}`);
      config.command = command.trim();
      config.args = argsInput.trim() ? argsInput.split(',').map(a => a.trim()) : [];
    } else {
      const endpoint = await this.smartInput!.question(`${Colors.cyan}  Endpoint URL:${Colors.reset}`);
      config.endpoint = endpoint.trim();
    }

    const filePath = path.join(mcpDir, `${name.trim().toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ [name.trim()]: config }, null, 2));

    w(`\r\n${Colors.green}  MCP config saved: ${filePath}${Colors.reset}\r\n`);
    w(`${Colors.dim}  Restart to connect the server${Colors.reset}\r\n\r\n`);
  }

  private cmdModel(args: string[]) {
    const w = (s: string) => process.stdout.write(s);
    if (args.length === 0) {
      w(`\r\n${Colors.bold}Current Model:${Colors.reset}\r\n`);
      w(`  Provider: ${Colors.cyan}${this.configService.getProvider()}${Colors.reset}\r\n`);
      w(`  Model:    ${Colors.cyan}${this.configService.getModel()}${Colors.reset}\r\n\r\n`);
      w(`  ${Colors.dim}Set model via: LLM_PROVIDER=openai OPENAI_API_KEY=sk-... cast-code${Colors.reset}\r\n`);
      w(`  ${Colors.dim}Or edit: .cast/config.md frontmatter${Colors.reset}\r\n\r\n`);
      return;
    }
    w(`${Colors.yellow}  Model change requires restart. Update .env or .cast/config.md${Colors.reset}\r\n`);
  }

  private cmdConfig() {
    const w = (s: string) => process.stdout.write(s);
    
    const castDir = path.join(process.cwd(), '.cast');
    const hasCastDir = fs.existsSync(castDir);
    
    w('\r\n');
    w(colorize(Icons.gear + ' ', 'accent') + colorize('Configuration', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(25), 'subtle') + '\r\n');
    w(`  ${colorize('Provider:', 'muted')}    ${colorize(this.configService.getProvider(), 'cyan')}\r\n`);
    w(`  ${colorize('Model:', 'muted')}       ${colorize(this.configService.getModel(), 'cyan')}\r\n`);
    w(`  ${colorize('Temp:', 'muted')}        ${colorize(this.configService.getTemperature().toString(), 'cyan')}\r\n`);
    w(`  ${colorize('CWD:', 'muted')}         ${colorize(process.cwd(), 'accent')}\r\n`);
    w(`  ${colorize('Messages:', 'muted')}   ${this.deepAgent.getMessageCount()}\r\n`);
    w(`  ${colorize('.cast/:', 'muted')}     ${hasCastDir ? colorize('✓ found', 'success') : colorize('not found (use /init)', 'warning')}\r\n`);
    w('\r\n');
  }

  private cmdInit() {
    const castDir = path.join(process.cwd(), '.cast');
    const w = (s: string) => process.stdout.write(s);

    if (fs.existsSync(castDir)) {
      w(`  ${Colors.dim}.cast/ already exists${Colors.reset}\r\n`);
      return;
    }

    fs.mkdirSync(castDir, { recursive: true });
    fs.mkdirSync(path.join(castDir, 'definitions', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(castDir, 'definitions', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(castDir, 'mcp'), { recursive: true });

    fs.writeFileSync(
      path.join(castDir, 'config.md'),
      [
        '---',
        'model: gpt-5.1-codex-mini',
        'temperature: 0',
        '---',
        '',
        '# Project Context',
        '',
        'Describe your project here. This context will be provided to the agent.',
        '',
      ].join('\n'),
    );

    w(`${Colors.green}  Initialized .cast/ directory${Colors.reset}\r\n`);
    w(`  ${Colors.dim}Created: config.md, definitions/agents/, definitions/skills/, mcp/${Colors.reset}\r\n`);
    w(`  ${Colors.dim}Edit .cast/config.md to configure your project${Colors.reset}\r\n\r\n`);
  }

  private cmdContext() {
    const w = (s: string) => process.stdout.write(s);
    
    w('\r\n');
    w(colorize(Icons.circle + ' ', 'accent') + colorize('Session', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n');
    w(`  ${colorize('Messages:', 'muted')} ${this.deepAgent.getMessageCount()}\r\n`);
    w(`  ${colorize('Tokens:', 'muted')}   ${colorize(this.deepAgent.getTokenCount().toLocaleString(), 'cyan')}\r\n`);
    w(`  ${colorize('CWD:', 'muted')}      ${colorize(process.cwd(), 'accent')}\r\n`);
    w(`  ${colorize('Model:', 'muted')}    ${colorize(this.configService.getProvider() + '/' + this.configService.getModel(), 'cyan')}\r\n`);
    w('\r\n');
  }

  private cmdMentionsHelp() {
    const w = (s: string) => process.stdout.write(s);
    
    w('\r\n');
    w(colorize(Icons.file + ' ', 'accent') + colorize('Mentions — inject context with @', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(35), 'subtle') + '\r\n');
    w(`  ${colorize('@path/to/file.ts', 'cyan')}   Read file content\r\n`);
    w(`  ${colorize('@path/to/dir/', 'cyan')}      List directory\r\n`);
    w(`  ${colorize('@https://url.com', 'cyan')}   Fetch URL\r\n`);
    w(`  ${colorize('@git:status', 'cyan')}        Git status\r\n`);
    w(`  ${colorize('@git:diff', 'cyan')}          Git diff\r\n`);
    w(`  ${colorize('@git:log', 'cyan')}           Git log\r\n`);
    w(`  ${colorize('@git:branch', 'cyan')}        List branches\r\n`);
    w('\r\n');
    w(`  ${colorize('Example:', 'muted')} "Explain this @src/main.ts"\r\n`);
    w(`  ${colorize('Tip:', 'muted')} Type @ and suggestions will appear\r\n`);
    w('\r\n');
  }

  private printHelp() {
    const w = (s: string) => process.stdout.write(s);
    
    const header = (text: string, icon?: string) => {
      const iconStr = icon ? colorize(icon + ' ', 'accent') : '';
      return '\n' + iconStr + colorize(text, 'bold') + '\n' + colorize(Box.horizontal.repeat(text.length + (icon ? 2 : 0)), 'subtle') + '\n';
    };

    const cmd = (name: string, desc: string, nameWidth = 16) => {
      const paddedName = name.padEnd(nameWidth);
      return `  ${colorize(paddedName, 'cyan')} ${colorize(desc, 'muted')}\r\n`;
    };

    w('\r\n');
    
    // Commands section
    w(header('Commands', Icons.diamond));
    w(cmd('/help', 'Show this help'));
    w(cmd('/clear', 'Clear conversation'));
    w(cmd('/compact', 'Compact history'));
    w(cmd('/exit', 'Exit'));

    // Git section
    w(header('Git', Icons.branch));
    w(cmd('/status', 'Git status'));
    w(cmd('/diff', 'Git diff'));
    w(cmd('/log', 'Git log (recent 15)'));
    w(cmd('/commit [msg]', 'Commit (AI-assisted or manual)'));
    w(cmd('/up', 'Smart commit & push'));
    w(cmd('/split-up', 'Split into multiple commits'));
    w(cmd('/pr', 'Create PR with AI description'));
    w(cmd('/review [files]', 'Code review'));
    w(cmd('/fix <file>', 'Auto-fix code issues'));
    w(cmd('/ident', 'Format all code files'));
    w(cmd('/release [tag]', 'Generate release notes'));

    // Agents & Skills section
    w(header('Agents & Skills', Icons.robot));
    w(cmd('/agents', 'List agents'));
    w(cmd('/agents create', 'Create new agent'));
    w(cmd('/skills', 'List skills'));
    w(cmd('/skills create', 'Create new skill'));

    // Info section
    w(header('Info', Icons.search));
    w(cmd('/tools', 'List available tools'));
    w(cmd('/context', 'Session info'));
    w(cmd('/mentions', 'Mentions help (@)'));

    // Config section
    w(header('Config', Icons.gear));
    w(cmd('/model', 'Show/change model'));
    w(cmd('/config', 'Show configuration'));
    w(cmd('/init', 'Initialize .cast/ directory'));

    // MCP section
    w(header('MCP', Icons.cloud));
    w(cmd('/mcp list', 'List MCP servers'));
    w(cmd('/mcp tools', 'List MCP tools'));
    w(cmd('/mcp add', 'Add new MCP server'));
    w(cmd('/mcp help', 'MCP setup guide'));

    // Mentions section
    w(header('Mentions', Icons.file));
    w(cmd('@file.ts', 'Inject file content'));
    w(cmd('@dir/', 'Inject directory listing'));
    w(cmd('@git:status', 'Inject git status'));

    // Tips section
    w(header('Tips', Icons.lightbulb));
    w(`  ${colorize('Type /', 'dim')}     Commands appear as you type\r\n`);
    w(`  ${colorize('Type @', 'dim')}     File suggestions appear\r\n`);
    w(`  ${colorize('Tab', 'dim')}        Accept suggestion\r\n`);
    w(`  ${colorize('↑↓', 'dim')}         Navigate suggestions\r\n`);
    w(`  ${colorize('Ctrl+C', 'dim')}     Cancel operation\r\n`);
    w(`  ${colorize('Ctrl+D', 'dim')}     Exit\r\n`);
    
    w('\r\n');
  }

  private runGit(cmd: string) {
    try {
      const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
      process.stdout.write(output ? `\r\n${output}\r\n\r\n` : `  ${Colors.dim}(no output)${Colors.reset}\r\n`);
    } catch (e) {
      process.stdout.write(`${Colors.red}  ${(e as Error).message}${Colors.reset}\r\n`);
    }
  }

  stop() {
    this.stopSpinner();
    this.smartInput?.destroy();
  }
}
