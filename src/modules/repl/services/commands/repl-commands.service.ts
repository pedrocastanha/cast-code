import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { ConfigService } from '../../../../common/services/config.service';
import { DeepAgentService } from '../../../core/services/deep-agent.service';
import { McpRegistryService } from '../../../mcp/services/mcp-registry.service';
import { AgentLoaderService } from '../../../agents/services/agent-loader.service';
import { SkillRegistryService } from '../../../skills/services/skill-registry.service';
import { ProjectContextService } from '../../../project/services/project-context.service';
import { MemoryService } from '../../../memory/services/memory.service';

@Injectable()
export class ReplCommandsService {
  constructor(
    private readonly deepAgent: DeepAgentService,
    private readonly configService: ConfigService,
    private readonly mcpRegistry: McpRegistryService,
    private readonly agentLoader: AgentLoaderService,
    private readonly skillRegistry: SkillRegistryService,
    private readonly projectContext: ProjectContextService,
    private readonly memoryService: MemoryService,
  ) {}

  printHelp(): void {
    const w = (s: string) => process.stdout.write(s + '\r\n');

    // Section header — clean, minimal
    const section = (title: string) => {
      w('');
      w(`  ${colorize(title, 'muted')}`);
    };

    // Command row
    const cmd = (name: string, desc: string, nameWidth = 18) => {
      const padded = name.padEnd(nameWidth);
      process.stdout.write(`    ${colorize(padded, 'cyan')}${colorize(desc, 'muted')}\r\n`);
    };

    w('');
    w(`  ${colorize('cast', 'primary')}${colorize('code', 'bold')} ${colorize('— command reference', 'muted')}`);
    w('');

    section('General');
    cmd('/help', 'show this reference');
    cmd('/clear', 'clear conversation history');
    cmd('/compact', 'summarize and compress history');
    cmd('/context', 'show session info');
    cmd('/exit', 'quit');

    section('Git');
    cmd('/status', 'git status');
    cmd('/diff [ref]', 'git diff');
    cmd('/log', 'recent commits');
    cmd('/commit [msg]', 'AI-assisted or manual commit');
    cmd('/up', 'smart commit & push');
    cmd('/split-up', 'split into multiple commits');
    cmd('/pr', 'create PR with AI description');
    cmd('/unit-test', 'generate tests for branch changes');
    cmd('/review [files]', 'code review');
    cmd('/fix <file>', 'auto-fix code issues');
    cmd('/ident', 'format all code files');
    cmd('/release [tag]', 'generate release notes');

    section('Agents & Skills');
    cmd('/agents', 'list loaded agents');
    cmd('/agents create', 'create new agent');
    cmd('/skills', 'list loaded skills');
    cmd('/skills create', 'create new skill');

    section('Project & Config');
    cmd('/init', 'analyze project & generate context');
    cmd('/project show', 'display current project context');
    cmd('/project edit', 'open project context in editor');
    cmd('/project-deep', 'deep analysis + agent brief');
    cmd('/model', 'show current model');
    cmd('/config', 'show/edit configuration');

    section('Tools & MCP');
    cmd('/tools', 'list available tools');
    cmd('/mcp list', 'list MCP servers');
    cmd('/mcp tools', 'list MCP tools');
    cmd('/mcp add', 'add MCP server');
    cmd('/mcp help', 'MCP setup guide');
    cmd('/kanban', 'open kanban task board');
    cmd('/remote', 'start remote web interface via ngrok');

    section('Session & History');
    cmd('/rollback [file]', 'restore file from snapshot');
    cmd('/stats', 'show session token & cost stats');
    cmd('/replay [list|save|show]', 'save/view session replays');
    cmd('/vault [list|show|promote]', 'manage code snippet vault');

    section('Context Mentions  (@)');
    cmd('@file.ts', 'inject file content');
    cmd('@dir/', 'inject directory listing');
    cmd('@git:status', 'inject git status');
    cmd('@git:diff', 'inject git diff');
    cmd('@https://url', 'fetch and inject URL');

    section('Keyboard shortcuts');
    process.stdout.write(`    ${colorize('Tab', 'cyan')}                accept autocomplete suggestion\r\n`);
    process.stdout.write(`    ${colorize('↑ / ↓', 'cyan')}             navigate suggestions or history\r\n`);
    process.stdout.write(`    ${colorize('Ctrl+C', 'cyan')}            cancel current operation\r\n`);
    process.stdout.write(`    ${colorize('Ctrl+D', 'cyan')}            exit\r\n`);

    w('');
  }

  cmdClear(welcomeScreen: { printBanner: () => void }): void {
    this.deepAgent.clearHistory();
    process.stdout.write('\x1bc');
    welcomeScreen.printBanner();
    process.stdout.write(`  ${colorize(Icons.check, 'success')} ${colorize('Conversation cleared', 'muted')}\r\n\r\n`);
  }

  cmdContext(): void {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(`  ${colorize('Session', 'bold')}\r\n`);
    w(`  ${colorize(Box.horizontal.repeat(36), 'subtle')}\r\n`);
    w('\r\n');

    w(`  ${colorize('Messages', 'muted')}    ${this.deepAgent.getMessageCount()}\r\n`);
    w(`  ${colorize('Tokens', 'muted')}      ${colorize(this.deepAgent.getTokenCount().toLocaleString(), 'cyan')}\r\n`);
    w(`  ${colorize('CWD', 'muted')}         ${colorize(process.cwd(), 'accent')}\r\n`);
    w(`  ${colorize('Model', 'muted')}       ${colorize(this.configService.getProvider() + '/' + this.configService.getModel(), 'cyan')}\r\n`);

    w('\r\n');

    const mcpSummaries = this.mcpRegistry.getServerSummaries();
    const mcpConnected = mcpSummaries.filter(s => s.status === 'connected').length;
    const mcpTotal = mcpSummaries.length;
    const mcpTools = mcpSummaries.reduce((sum, s) => sum + s.toolCount, 0);

    const mcpStatus = mcpConnected > 0
      ? colorize(`${mcpConnected}/${mcpTotal}`, 'success')
      : colorize(`${mcpConnected}/${mcpTotal}`, 'muted');
    const mcpToolsStr = mcpTools > 0 ? colorize(` (${mcpTools} tools)`, 'muted') : '';
    w(`  ${colorize('MCP', 'muted')}         ${mcpStatus}${mcpToolsStr}\r\n`);

    if (mcpSummaries.length > 0) {
      for (const s of mcpSummaries) {
        const icon = s.status === 'connected' ? colorize('●', 'success') : colorize('○', 'muted');
        w(`    ${icon} ${colorize(s.name, 'cyan')} ${colorize(`(${s.toolCount} tools)`, 'muted')}\r\n`);
      }
    }

    w('\r\n');

    const agents = this.agentLoader.getAllAgents();
    w(`  ${colorize('Agents', 'muted')}      ${colorize(agents.length.toString(), 'cyan')}`);
    if (agents.length > 0) {
      const names = agents.slice(0, 5).map(a => a.name).join(', ');
      const more = agents.length > 5 ? ` +${agents.length - 5}` : '';
      w(`  ${colorize(names + more, 'muted')}`);
    }
    w('\r\n');

    const skills = this.skillRegistry.getAllSkills();
    w(`  ${colorize('Skills', 'muted')}      ${colorize(skills.length.toString(), 'cyan')}`);
    if (skills.length > 0) {
      const names = skills.slice(0, 5).map(s => s.name).join(', ');
      const more = skills.length > 5 ? ` +${skills.length - 5}` : '';
      w(`  ${colorize(names + more, 'muted')}`);
    }
    w('\r\n\r\n');

    const hasContext = this.projectContext.hasContext();
    w(`  ${colorize('Project', 'muted')}     ${hasContext ? colorize('loaded', 'success') : colorize('not loaded — run /init', 'muted')}\r\n`);

    const memOk = this.memoryService.isInitialized();
    w(`  ${colorize('Memory', 'muted')}      ${memOk ? colorize('enabled', 'success') : colorize('not configured', 'muted')}\r\n`);

    w('\r\n');
  }

  cmdModel(args: string[]): void {
    if (args.length === 0) {
      process.stdout.write('\r\n');
      process.stdout.write(`  ${colorize('Model', 'bold')}\r\n`);
      process.stdout.write(`  ${colorize(Box.horizontal.repeat(24), 'subtle')}\r\n\r\n`);
      process.stdout.write(`  ${colorize('Provider', 'muted')}  ${colorize(this.configService.getProvider(), 'cyan')}\r\n`);
      process.stdout.write(`  ${colorize('Model', 'muted')}     ${colorize(this.configService.getModel(), 'cyan')}\r\n\r\n`);
      process.stdout.write(`  ${colorize('Tip:', 'muted')} configure via ${colorize('~/.cast/config.yaml', 'cyan')} or env vars\r\n\r\n`);
      return;
    }
    process.stdout.write(`  ${colorize('To change model, run', 'muted')} ${colorize('/config set-model', 'cyan')}\r\n`);
  }

  cmdMentionsHelp(): void {
    const w = (s: string) => process.stdout.write(s + '\r\n');
    const row = (name: string, desc: string, w2 = 22) =>
      process.stdout.write(`    ${colorize(name.padEnd(w2), 'cyan')}${colorize(desc, 'muted')}\r\n`);

    w('');
    w(`  ${colorize('Mentions', 'bold')} ${colorize('— inject context with @', 'muted')}`);
    w(`  ${colorize(Box.horizontal.repeat(36), 'subtle')}`);
    w('');
    row('@path/to/file.ts', 'inject file content');
    row('@path/to/dir/', 'inject directory listing');
    row('@https://url.com', 'fetch and inject URL');
    row('@git:status', 'git status');
    row('@git:diff', 'git diff');
    row('@git:log', 'git log');
    row('@git:branch', 'list branches');
    w('');
    w(`  ${colorize('Example:', 'muted')} "Explain ${colorize('@src/main.ts', 'cyan')}"`);
    w(`  ${colorize('Tip:', 'muted')}    Type ${colorize('@', 'cyan')} and suggestions appear automatically`);
    w('');
  }
}
