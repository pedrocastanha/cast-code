import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DeepAgentService } from '../../core/services/deep-agent.service';
import { ConfigService } from '../../core/services/config.service';
import { MentionsService } from '../../mentions/services/mentions.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { SmartInput, Suggestion } from './smart-input';

// ─── ANSI Colors ───
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

// ─── Spinner ───
const SPIN = ['\u28cb', '\u28d9', '\u28f9', '\u28f8', '\u28fc', '\u28f4', '\u28e6', '\u28e7', '\u28c7', '\u28cf'];

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
  ) {}

  //  START
  async start() {
    this.printBanner();

    const initResult = await this.deepAgent.initialize();

    if (initResult.projectPath) {
      console.log(`  ${C.green}Project${C.reset}  ${C.dim}${initResult.projectPath}${C.reset}`);
    }

    const provider = this.configService.getProvider();
    const model = this.configService.getModel();
    console.log(`  ${C.blue}Model${C.reset}    ${C.dim}${provider}/${model}${C.reset}`);
    console.log(`  ${C.dim}${initResult.toolCount} tools loaded${C.reset}`);
    console.log('');

    this.smartInput = new SmartInput({
      prompt: `${C.cyan}${C.bold}>${C.reset} `,
      promptVisibleLen: 2,
      getCommandSuggestions: (input) => this.getCommandSuggestions(input),
      getMentionSuggestions: (partial) => this.getMentionSuggestions(partial),
      onSubmit: (line) => this.handleLine(line),
      onCancel: () => this.handleCancel(),
      onExit: () => this.handleExit(),
    });

    this.smartInput.start();
  }
  
  private printBanner() {
    console.log('');
    console.log(`${C.cyan}${C.bold}  \u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e${C.reset}`);
    console.log(`${C.cyan}${C.bold}  \u2502          CAST CODE               \u2502${C.reset}`);
    console.log(`${C.cyan}${C.bold}  \u2502     Multi-Agent CLI Assistant    \u2502${C.reset}`);
    console.log(`${C.cyan}${C.bold}  \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f${C.reset}`);
    console.log('');
    console.log(`  ${C.dim}/help for commands  |  @file for context  |  Tab to select${C.reset}`);
    console.log('');
  }

  private getCommandSuggestions(input: string): Suggestion[] {
    if (input.startsWith('/mcp ')) {
      return [
        { text: '/mcp list',  display: '/mcp list',  description: 'List servers' },
        { text: '/mcp tools', display: '/mcp tools', description: 'List MCP tools' },
        { text: '/mcp add',   display: '/mcp add',   description: 'Add new server' },
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

    // ─── Comandos principais ───
    const commands: Suggestion[] = [
      { text: '/help',     display: '/help',     description: 'Show help' },
      { text: '/clear',    display: '/clear',    description: 'Clear conversation' },
      { text: '/compact',  display: '/compact',  description: 'Compact history' },
      { text: '/exit',     display: '/exit',     description: 'Exit' },
      { text: '/status',   display: '/status',   description: 'Git status' },
      { text: '/diff',     display: '/diff',     description: 'Git diff' },
      { text: '/log',      display: '/log',      description: 'Git log' },
      { text: '/commit',   display: '/commit',   description: 'Commit changes' },
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

  //  CALLBACKS

  private handleCancel() {
    if (this.isProcessing && this.abortController) {
      this.abortController.abort();
      this.stopSpinner();
      process.stdout.write(`\r\n${C.yellow}  Cancelled${C.reset}\r\n\r\n`);
      this.isProcessing = false;
    } else {
      process.stdout.write(`${C.dim}  (Use /exit to quit)${C.reset}\r\n`);
      this.smartInput?.showPrompt();
    }
  }

  private handleExit() {
    process.stdout.write(`${C.dim}  Goodbye!${C.reset}\r\n`);
    process.exit(0);
  }

  //  LINE HANDLER

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

  //  SLASH COMMANDS

  private async handleCommand(command: string) {
    const parts = command.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':       this.printHelp(); break;
      case 'clear':      this.cmdClear(); break;
      case 'exit':
      case 'quit':       process.exit(0);
      case 'compact':    this.deepAgent.clearHistory(); process.stdout.write(`${C.green}  History compacted${C.reset}\r\n`); break;
      case 'status':     this.runGit('git status'); break;
      case 'diff':       this.runGit(args.length ? `git diff ${args.join(' ')}` : 'git diff'); break;
      case 'log':        this.runGit('git log --oneline -15'); break;
      case 'commit':     await this.cmdCommit(args); break;
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
        process.stdout.write(`${C.red}  Unknown: /${cmd}${C.reset}  ${C.dim}Type /help${C.reset}\r\n`);
    }
  }

  //  MESSAGE from AGENT

  private async handleMessage(message: string) {
    this.isProcessing = true;
    this.abortController = new AbortController();
    this.smartInput?.enterPassiveMode();

    try {
      const mentionResult = await this.mentionsService.processMessage(message);

      if (mentionResult.mentions.length > 0) {
        const summary = this.mentionsService.getMentionsSummary(mentionResult.mentions);
        for (const line of summary) {
          process.stdout.write(`${C.dim}${line}${C.reset}\r\n`);
        }
        process.stdout.write('\r\n');
      }

      this.startSpinner('Thinking');

      let firstChunk = true;

      for await (const chunk of this.deepAgent.chat(mentionResult.expandedMessage)) {
        if (this.abortController?.signal.aborted) break;

        if (firstChunk) {
          this.stopSpinner();
          process.stdout.write(`\r\n${C.magenta}${C.bold}Cast${C.reset} `);
          firstChunk = false;
        }

        process.stdout.write(chunk);
      }

      if (!firstChunk) {
        process.stdout.write('\r\n\r\n');
      } else {
        this.stopSpinner();
      }
    } catch (error) {
      this.stopSpinner();
      const msg = (error as Error).message;
      if (!msg.includes('abort')) {
        process.stdout.write(`\r\n${C.red}  Error: ${msg}${C.reset}\r\n\r\n`);
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      this.smartInput?.exitPassiveMode();
    }
  }

  //  SPINNER
  private startSpinner(label: string) {
    let i = 0;
    this.spinnerTimer = setInterval(() => {
      process.stdout.write(`\r${C.cyan}${SPIN[i++ % SPIN.length]}${C.reset} ${C.dim}${label}...${C.reset}`);
    }, 80);
  }

  private stopSpinner() {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
      process.stdout.write('\r\x1b[K');
    }
  }

  private cmdClear() {
    this.deepAgent.clearHistory();
    process.stdout.write('\x1b[2J\x1b[H');
    this.printBanner();
    process.stdout.write(`${C.green}  Conversation cleared${C.reset}\r\n`);
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

    w(`\r\n${C.bold}Built-in Tools (${builtIn.length}):${C.reset}\r\n`);
    for (const [name, desc] of builtIn) {
      w(`  ${C.cyan}${name}${C.reset}${' '.repeat(max - name.length + 2)}${C.dim}${desc}${C.reset}\r\n`);
    }

    const mcpTools = this.mcpRegistry.getAllMcpTools();
    if (mcpTools.length > 0) {
      w(`\r\n${C.bold}MCP Tools (${mcpTools.length}):${C.reset}\r\n`);
      for (const t of mcpTools) {
        w(`  ${C.cyan}${t.name}${C.reset}  ${C.dim}${t.description}${C.reset}\r\n`);
      }
    }
    w('\r\n');
  }

  // ─── /agents ───
  private async cmdAgents(args: string[]) {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const agents = this.agentRegistry.resolveAllAgents();
      w(`\r\n${C.bold}Agents (${agents.length}):${C.reset}\r\n`);

      if (agents.length === 0) {
        w(`  ${C.dim}No agents loaded.${C.reset}\r\n`);
        w(`  ${C.dim}Create one with /agents create or add .md files to .cast/definitions/agents/${C.reset}\r\n`);
      } else {
        const maxName = Math.max(...agents.map(a => a.name.length));
        for (const a of agents) {
          const toolNames = (a.tools as any[]).map((t: any) => t.name).join(', ');
          const toolsInfo = toolNames ? ` ${C.dim}[${toolNames}]${C.reset}` : '';
          w(`  ${C.cyan}${a.name}${C.reset}${' '.repeat(maxName - a.name.length + 2)}${C.dim}${a.description}${C.reset}${toolsInfo}\r\n`);
        }
      }
      w(`\r\n  ${C.dim}/agents <name> - agent details  |  /agents create - new agent${C.reset}\r\n\r\n`);
      return;
    }

    if (sub === 'create') {
      await this.createAgentWizard();
      return;
    }

    const agent = this.agentRegistry.resolveAgent(sub);
    if (agent) {
      const toolNames = (agent.tools as any[]).map((t: any) => t.name);
      w(`\r\n${C.bold}Agent: ${C.cyan}${agent.name}${C.reset}\r\n`);
      w(`  ${C.dim}Description:${C.reset} ${agent.description}\r\n`);
      w(`  ${C.dim}Model:${C.reset}       ${agent.model}\r\n`);
      w(`  ${C.dim}Tools (${toolNames.length}):${C.reset}  ${toolNames.length > 0 ? toolNames.join(', ') : 'none'}\r\n`);
      w(`  ${C.dim}MCP:${C.reset}         ${agent.mcp.length > 0 ? agent.mcp.join(', ') : 'none'}\r\n\r\n`);
    } else {
      w(`${C.red}  Agent "${sub}" not found${C.reset}\r\n`);
    }
  }

  private async createAgentWizard() {
    const castDir = path.join(process.cwd(), '.cast', 'definitions', 'agents');
    if (!fs.existsSync(castDir)) fs.mkdirSync(castDir, { recursive: true });

    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${C.bold}  Create New Agent${C.reset}\r\n\r\n`);

    const name = await this.smartInput!.question(`${C.cyan}  Name:${C.reset}`);
    if (!name.trim()) { w(`${C.red}  Cancelled${C.reset}\r\n`); return; }

    const description = await this.smartInput!.question(`${C.cyan}  Description:${C.reset}`);
    const skillsInput = await this.smartInput!.question(`${C.cyan}  Skills (comma-separated, or empty):${C.reset}`);
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

    w(`\r\n${C.green}  Agent created: ${filePath}${C.reset}\r\n`);
    w(`${C.dim}  Edit the file to customize the system prompt${C.reset}\r\n`);
    w(`${C.dim}  Restart to load the new agent${C.reset}\r\n\r\n`);
  }

  // ─── /skills ───
  private async cmdSkills(args: string[]) {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const skills = this.skillRegistry.getAllSkills();
      w(`\r\n${C.bold}Skills (${skills.length}):${C.reset}\r\n`);

      if (skills.length === 0) {
        w(`  ${C.dim}No skills loaded.${C.reset}\r\n`);
        w(`  ${C.dim}Create one with /skills create or add .md files to .cast/definitions/skills/${C.reset}\r\n`);
      } else {
        for (const s of skills) {
          w(`  ${C.cyan}${s.name}${C.reset}  ${C.dim}${s.description}${C.reset}  ${C.dim}[${s.tools.join(', ')}]${C.reset}\r\n`);
        }
      }
      w(`\r\n  ${C.dim}/skills create - create a new skill${C.reset}\r\n\r\n`);
      return;
    }

    if (sub === 'create') {
      await this.createSkillWizard();
      return;
    }

    w(`${C.red}  Unknown: /skills ${sub}${C.reset}\r\n`);
  }

  private async createSkillWizard() {
    const castDir = path.join(process.cwd(), '.cast', 'definitions', 'skills');
    if (!fs.existsSync(castDir)) fs.mkdirSync(castDir, { recursive: true });

    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${C.bold}  Create New Skill${C.reset}\r\n\r\n`);

    const name = await this.smartInput!.question(`${C.cyan}  Name:${C.reset}`);
    if (!name.trim()) { w(`${C.red}  Cancelled${C.reset}\r\n`); return; }

    const description = await this.smartInput!.question(`${C.cyan}  Description:${C.reset}`);

    w(`\r\n  ${C.dim}Available tools: read_file, write_file, edit_file, glob, grep, ls, shell, web_fetch${C.reset}\r\n`);
    const toolsInput = await this.smartInput!.question(`${C.cyan}  Tools (comma-separated):${C.reset}`);
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

    w(`\r\n${C.green}  Skill created: ${filePath}${C.reset}\r\n`);
    w(`${C.dim}  Edit the file to add guidelines${C.reset}\r\n`);
    w(`${C.dim}  Restart to load the new skill${C.reset}\r\n\r\n`);
  }

  // ─── /mcp ───
  private async cmdMcp(args: string[]) {
    const sub = args[0] || 'list';
    const w = (s: string) => process.stdout.write(s);

    switch (sub) {
      case 'list': {
        w(`\r\n${C.bold}MCP Servers:${C.reset}\r\n`);
        const results = await this.mcpRegistry.connectAll();
        if (results.size === 0) {
          w(`  ${C.dim}No MCP servers configured${C.reset}\r\n`);
          w(`  ${C.dim}Use /mcp add to connect one${C.reset}\r\n`);
        } else {
          for (const [name, connected] of results) {
            const st = connected ? `${C.green}connected${C.reset}` : `${C.red}disconnected${C.reset}`;
            w(`  ${C.cyan}${name}${C.reset}: ${st}\r\n`);
          }
        }
        w('\r\n');
        break;
      }

      case 'tools': {
        const tools = this.mcpRegistry.getAllMcpTools();
        if (tools.length === 0) {
          w(`  ${C.dim}No MCP tools available. Connect a server first with /mcp add${C.reset}\r\n`);
        } else {
          w(`\r\n${C.bold}MCP Tools (${tools.length}):${C.reset}\r\n`);
          for (const t of tools) {
            w(`  ${C.cyan}${t.name}${C.reset}  ${C.dim}${t.description}${C.reset}\r\n`);
          }
          w('\r\n');
        }
        break;
      }

      case 'add': {
        await this.addMcpWizard();
        break;
      }

      default:
        w(`  ${C.dim}Usage: /mcp list | /mcp tools | /mcp add${C.reset}\r\n`);
    }
  }

  private async addMcpWizard() {
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');
    if (!fs.existsSync(mcpDir)) fs.mkdirSync(mcpDir, { recursive: true });

    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${C.bold}  Add MCP Server${C.reset}\r\n\r\n`);

    const name = await this.smartInput!.question(`${C.cyan}  Server name:${C.reset}`);
    if (!name.trim()) { w(`${C.red}  Cancelled${C.reset}\r\n`); return; }

    const typeChoice = await this.smartInput!.askChoice('  Transport type:', [
      { key: 'stdio', label: 'stdio', description: 'Local process (most common)' },
      { key: 'http',  label: 'http',  description: 'HTTP endpoint' },
      { key: 'sse',   label: 'sse',   description: 'Server-Sent Events' },
    ]);

    const config: Record<string, any> = { type: typeChoice };

    if (typeChoice === 'stdio') {
      const command = await this.smartInput!.question(`${C.cyan}  Command (e.g., npx -y @modelcontextprotocol/server-filesystem):${C.reset}`);
      const argsInput = await this.smartInput!.question(`${C.cyan}  Arguments (comma-separated, or empty):${C.reset}`);
      config.command = command.trim();
      config.args = argsInput.trim() ? argsInput.split(',').map(a => a.trim()) : [];
    } else {
      const endpoint = await this.smartInput!.question(`${C.cyan}  Endpoint URL:${C.reset}`);
      config.endpoint = endpoint.trim();
    }

    const filePath = path.join(mcpDir, `${name.trim().toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ [name.trim()]: config }, null, 2));

    w(`\r\n${C.green}  MCP config saved: ${filePath}${C.reset}\r\n`);
    w(`${C.dim}  Restart to connect the server${C.reset}\r\n\r\n`);
  }

  private cmdModel(args: string[]) {
    const w = (s: string) => process.stdout.write(s);
    if (args.length === 0) {
      w(`\r\n${C.bold}Current Model:${C.reset}\r\n`);
      w(`  Provider: ${C.cyan}${this.configService.getProvider()}${C.reset}\r\n`);
      w(`  Model:    ${C.cyan}${this.configService.getModel()}${C.reset}\r\n\r\n`);
      w(`  ${C.dim}Set model via: LLM_PROVIDER=openai OPENAI_API_KEY=sk-... cast-code${C.reset}\r\n`);
      w(`  ${C.dim}Or edit: .cast/config.md frontmatter${C.reset}\r\n\r\n`);
      return;
    }
    w(`${C.yellow}  Model change requires restart. Update .env or .cast/config.md${C.reset}\r\n`);
  }

  private cmdConfig() {
    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${C.bold}Configuration:${C.reset}\r\n`);
    w(`  Provider:    ${C.cyan}${this.configService.getProvider()}${C.reset}\r\n`);
    w(`  Model:       ${C.cyan}${this.configService.getModel()}${C.reset}\r\n`);
    w(`  Temperature: ${C.cyan}${this.configService.getTemperature()}${C.reset}\r\n`);
    w(`  CWD:         ${C.dim}${process.cwd()}${C.reset}\r\n`);
    w(`  Messages:    ${this.deepAgent.getMessageCount()}\r\n`);

    const castDir = path.join(process.cwd(), '.cast');
    w(`  .cast/:      ${fs.existsSync(castDir) ? `${C.green}found${C.reset}` : `${C.dim}not found (use /init)${C.reset}`}\r\n\r\n`);
  }

  private cmdInit() {
    const castDir = path.join(process.cwd(), '.cast');
    const w = (s: string) => process.stdout.write(s);

    if (fs.existsSync(castDir)) {
      w(`  ${C.dim}.cast/ already exists${C.reset}\r\n`);
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
        'model: gpt-4o',
        'temperature: 0',
        '---',
        '',
        '# Project Context',
        '',
        'Describe your project here. This context will be provided to the agent.',
        '',
      ].join('\n'),
    );

    w(`${C.green}  Initialized .cast/ directory${C.reset}\r\n`);
    w(`  ${C.dim}Created: config.md, definitions/agents/, definitions/skills/, mcp/${C.reset}\r\n`);
    w(`  ${C.dim}Edit .cast/config.md to configure your project${C.reset}\r\n\r\n`);
  }

  private cmdContext() {
    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${C.bold}Session:${C.reset}\r\n`);
    w(`  Messages:  ${this.deepAgent.getMessageCount()}\r\n`);
    w(`  Tokens:    ${C.cyan}${this.deepAgent.getTokenCount().toLocaleString()}${C.reset}\r\n`);
    w(`  CWD:       ${process.cwd()}\r\n`);
    w(`  Provider:  ${this.configService.getProvider()}/${this.configService.getModel()}\r\n\r\n`);
  }

  private cmdMentionsHelp() {
    const w = (s: string) => process.stdout.write(s);
    w(`\r\n${C.bold}Mentions \u2014 inject context with @${C.reset}\r\n\r\n`);
    w(`  ${C.cyan}@path/to/file.ts${C.reset}   Read file content\r\n`);
    w(`  ${C.cyan}@path/to/dir/${C.reset}      List directory\r\n`);
    w(`  ${C.cyan}@https://url.com${C.reset}   Fetch URL\r\n`);
    w(`  ${C.cyan}@git:status${C.reset}        Git status\r\n`);
    w(`  ${C.cyan}@git:diff${C.reset}          Git diff\r\n`);
    w(`  ${C.cyan}@git:log${C.reset}           Git log\r\n`);
    w(`  ${C.cyan}@git:branch${C.reset}        List branches\r\n\r\n`);
    w(`  ${C.dim}Example: "Explain this @src/main.ts"${C.reset}\r\n`);
    w(`  ${C.dim}Tip: Type @ and suggestions will appear${C.reset}\r\n\r\n`);
  }

  private printHelp() {
    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(`${C.bold}Commands${C.reset}\r\n`);
    w(`  ${C.cyan}/help${C.reset}           Show this help\r\n`);
    w(`  ${C.cyan}/clear${C.reset}          Clear conversation\r\n`);
    w(`  ${C.cyan}/compact${C.reset}        Compact history\r\n`);
    w(`  ${C.cyan}/exit${C.reset}           Exit\r\n`);
    w('\r\n');
    w(`${C.bold}Git${C.reset}\r\n`);
    w(`  ${C.cyan}/status${C.reset}         Git status\r\n`);
    w(`  ${C.cyan}/diff${C.reset}           Git diff\r\n`);
    w(`  ${C.cyan}/log${C.reset}            Git log (recent 15)\r\n`);
    w(`  ${C.cyan}/commit [msg]${C.reset}   Commit (agent-assisted or with message)\r\n`);
    w('\r\n');
    w(`${C.bold}Agents & Skills${C.reset}\r\n`);
    w(`  ${C.cyan}/agents${C.reset}         List agents\r\n`);
    w(`  ${C.cyan}/agents create${C.reset}  Create a new agent\r\n`);
    w(`  ${C.cyan}/skills${C.reset}         List skills\r\n`);
    w(`  ${C.cyan}/skills create${C.reset}  Create a new skill\r\n`);
    w('\r\n');
    w(`${C.bold}Info${C.reset}\r\n`);
    w(`  ${C.cyan}/tools${C.reset}          List available tools\r\n`);
    w(`  ${C.cyan}/context${C.reset}        Session info\r\n`);
    w(`  ${C.cyan}/mentions${C.reset}       Mentions help (@)\r\n`);
    w('\r\n');
    w(`${C.bold}Config${C.reset}\r\n`);
    w(`  ${C.cyan}/model${C.reset}          Show/change model\r\n`);
    w(`  ${C.cyan}/config${C.reset}         Show configuration\r\n`);
    w(`  ${C.cyan}/init${C.reset}           Initialize .cast/ directory\r\n`);
    w('\r\n');
    w(`${C.bold}MCP${C.reset}\r\n`);
    w(`  ${C.cyan}/mcp list${C.reset}       List MCP servers\r\n`);
    w(`  ${C.cyan}/mcp tools${C.reset}      List MCP tools\r\n`);
    w(`  ${C.cyan}/mcp add${C.reset}        Add new MCP server\r\n`);
    w('\r\n');
    w(`${C.bold}Mentions${C.reset}\r\n`);
    w(`  ${C.cyan}@file.ts${C.reset}        Inject file content\r\n`);
    w(`  ${C.cyan}@dir/${C.reset}           Inject directory listing\r\n`);
    w(`  ${C.cyan}@git:status${C.reset}     Inject git status\r\n`);
    w('\r\n');
    w(`${C.bold}Tips${C.reset}\r\n`);
    w(`  ${C.dim}Type /${C.reset}          Commands appear as you type\r\n`);
    w(`  ${C.dim}Type @${C.reset}          File suggestions appear as you type\r\n`);
    w(`  ${C.dim}Tab${C.reset}             Select suggestion\r\n`);
    w(`  ${C.dim}Arrow keys${C.reset}      Navigate suggestions\r\n`);
    w(`  ${C.dim}Ctrl+C${C.reset}          Cancel running operation\r\n`);
    w(`  ${C.dim}Ctrl+D${C.reset}          Exit\r\n`);
    w('\r\n');
  }

  private runGit(cmd: string) {
    try {
      const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
      process.stdout.write(output ? `\r\n${output}\r\n\r\n` : `  ${C.dim}(no output)${C.reset}\r\n`);
    } catch (e) {
      process.stdout.write(`${C.red}  ${(e as Error).message}${C.reset}\r\n`);
    }
  }

  stop() {
    this.stopSpinner();
    this.smartInput?.destroy();
  }
}
