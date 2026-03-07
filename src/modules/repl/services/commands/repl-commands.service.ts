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
    const header = (text: string, icon?: string) => {
      const iconStr = icon ? colorize(icon + ' ', 'accent') : '';
      return '\n' + iconStr + colorize(text, 'bold') + '\n' + colorize(Box.horizontal.repeat(text.length + (icon ? 2 : 0)), 'subtle') + '\n';
    };

    const cmd = (name: string, desc: string, nameWidth = 16) => {
      const paddedName = name.padEnd(nameWidth);
      return `  ${colorize(paddedName, 'cyan')} ${colorize(desc, 'muted')}\r\n`;
    };

    process.stdout.write('\r\n');
    
    process.stdout.write(header('Commands', Icons.diamond));
    process.stdout.write(cmd('/help', 'Show this help'));
    process.stdout.write(cmd('/clear', 'Clear conversation'));
    process.stdout.write(cmd('/compact', 'Compact history'));
    process.stdout.write(cmd('/exit', 'Exit'));

    process.stdout.write(header('Git', Icons.branch));
    process.stdout.write(cmd('/status', 'Git status'));
    process.stdout.write(cmd('/diff', 'Git diff'));
    process.stdout.write(cmd('/log', 'Git log (recent 15)'));
    process.stdout.write(cmd('/commit [msg]', 'Commit (AI-assisted or manual)'));
    process.stdout.write(cmd('/up', 'Smart commit & push'));
    process.stdout.write(cmd('/split-up', 'Split into multiple commits'));
    process.stdout.write(cmd('/pr', 'Create PR with AI description'));
    process.stdout.write(cmd('/unit-test', 'Generate unit tests for branch changes'));
    process.stdout.write(cmd('/review [files]', 'Code review'));
    process.stdout.write(cmd('/fix <file>', 'Auto-fix code issues'));
    process.stdout.write(cmd('/ident', 'Format all code files'));
    process.stdout.write(cmd('/release [tag]', 'Generate release notes'));

    process.stdout.write(header('Agents & Skills', Icons.robot));
    process.stdout.write(cmd('/agents', 'List agents'));
    process.stdout.write(cmd('/agents create', 'Create new agent'));
    process.stdout.write(cmd('/skills', 'List skills'));
    process.stdout.write(cmd('/skills create', 'Create new skill'));

    process.stdout.write(header('Info', Icons.search));
    process.stdout.write(cmd('/tools', 'List available tools'));
    process.stdout.write(cmd('/context', 'Session info'));
    process.stdout.write(cmd('/mentions', 'Mentions help (@)'));

    process.stdout.write(header('Config', Icons.gear));
    process.stdout.write(cmd('/model', 'Show/change model'));
    process.stdout.write(cmd('/config', 'Show configuration'));
    process.stdout.write(cmd('/init', 'Analyze project and generate context'));
    process.stdout.write(cmd('/project-deep', 'Generate deep context + agent brief'));

    process.stdout.write(header('MCP', Icons.cloud));
    process.stdout.write(cmd('/mcp list', 'List MCP servers'));
    process.stdout.write(cmd('/mcp tools', 'List MCP tools'));
    process.stdout.write(cmd('/mcp add', 'Add new MCP server'));
    process.stdout.write(cmd('/mcp help', 'MCP setup guide'));

    process.stdout.write(header('Frontend Flow', Icons.lightbulb));
    process.stdout.write(cmd('1) /mcp add', 'Connect Figma MCP'));
    process.stdout.write(cmd('2) /init', 'Map project and create context'));
    process.stdout.write(cmd('3) /agents', 'Ensure frontend agent is loaded'));
    process.stdout.write(cmd('4) prompt', 'Ask to scaffold screens/components from Figma'));

    process.stdout.write(header('Mentions', Icons.file));
    process.stdout.write(cmd('@file.ts', 'Inject file content'));
    process.stdout.write(cmd('@dir/', 'Inject directory listing'));
    process.stdout.write(cmd('@git:status', 'Inject git status'));

    process.stdout.write(header('Tips', Icons.lightbulb));
    process.stdout.write(`  ${colorize('Type /', 'dim')}     Commands appear as you type\r\n`);
    process.stdout.write(`  ${colorize('Type @', 'dim')}     File suggestions appear\r\n`);
    process.stdout.write(`  ${colorize('Tab', 'dim')}        Accept suggestion\r\n`);
    process.stdout.write(`  ${colorize('↑↓', 'dim')}         Navigate suggestions\r\n`);
    process.stdout.write(`  ${colorize('Ctrl+C', 'dim')}     Cancel operation\r\n`);
    process.stdout.write(`  ${colorize('Ctrl+D', 'dim')}     Exit\r\n`);
    
    process.stdout.write('\r\n');
  }

  cmdClear(welcomeScreen: { printBanner: () => void }): void {
    this.deepAgent.clearHistory();
    process.stdout.write('\x1b[2J\x1b[H');
    welcomeScreen.printBanner();
    process.stdout.write(`${Colors.green}  Conversation cleared${Colors.reset}\r\n`);
  }

  cmdContext(): void {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(colorize(Icons.circle + ' ', 'accent') + colorize('Session Info', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(40), 'subtle') + '\r\n\r\n');

    w(`  ${colorize('Messages:', 'muted')}  ${this.deepAgent.getMessageCount()}\r\n`);
    w(`  ${colorize('Tokens:', 'muted')}    ${colorize(this.deepAgent.getTokenCount().toLocaleString(), 'cyan')}\r\n`);
    w(`  ${colorize('CWD:', 'muted')}       ${colorize(process.cwd(), 'accent')}\r\n`);
    w(`  ${colorize('Model:', 'muted')}     ${colorize(this.configService.getProvider() + '/' + this.configService.getModel(), 'cyan')}\r\n\r\n`);

    const mcpSummaries = this.mcpRegistry.getServerSummaries();
    const mcpConnected = mcpSummaries.filter(s => s.status === 'connected').length;
    const mcpTotal = mcpSummaries.length;
    const mcpTools = mcpSummaries.reduce((sum, s) => sum + s.toolCount, 0);

    w(`  ${colorize('MCP Servers:', 'muted')} ${colorize(mcpConnected.toString(), mcpConnected > 0 ? 'success' : 'muted')}/${mcpTotal}`);
    if (mcpTools > 0) {
      w(` ${colorize(`(${mcpTools} tools)`, 'muted')}`);
    }
    w('\r\n');

    if (mcpSummaries.length > 0) {
      mcpSummaries.forEach(s => {
        const icon = s.status === 'connected' ? colorize('●', 'success') : colorize('○', 'error');
        w(`    ${icon} ${colorize(s.name, 'cyan')} ${colorize(`(${s.toolCount} tools)`, 'muted')}\r\n`);
      });
      w('\r\n');
    }

    const agents = this.agentLoader.getAllAgents();
    w(`  ${colorize('Agents:', 'muted')}      ${colorize(agents.length.toString(), 'cyan')}\r\n`);
    if (agents.length > 0) {
      const agentNames = agents.slice(0, 5).map(a => a.name).join(', ');
      const more = agents.length > 5 ? ` +${agents.length - 5}` : '';
      w(`    ${colorize(agentNames + more, 'muted')}\r\n\r\n`);
    } else {
      w('\r\n');
    }

    const skills = this.skillRegistry.getAllSkills();
    w(`  ${colorize('Skills:', 'muted')}      ${colorize(skills.length.toString(), 'cyan')}\r\n`);
    if (skills.length > 0) {
      const skillNames = skills.slice(0, 5).map(s => s.name).join(', ');
      const more = skills.length > 5 ? ` +${skills.length - 5}` : '';
      w(`    ${colorize(skillNames + more, 'muted')}\r\n\r\n`);
    } else {
      w('\r\n');
    }

    const hasContext = this.projectContext.hasContext();
    w(`  ${colorize('Project:', 'muted')}     ${hasContext ? colorize('✓ loaded', 'success') : colorize('not loaded', 'muted')}\r\n`);

    if (this.memoryService.isInitialized()) {
      w(`  ${colorize('Memory:', 'muted')}      ${colorize('✓ enabled', 'success')}\r\n`);
    } else {
      w(`  ${colorize('Memory:', 'muted')}      ${colorize('not configured', 'muted')}\r\n`);
    }

    w('\r\n');
  }

  cmdModel(args: string[]): void {
    if (args.length === 0) {
      process.stdout.write('\r\n' + colorize(Icons.robot + ' ', 'accent') + colorize('Current Model', 'bold') + '\r\n');
      process.stdout.write(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n');
      process.stdout.write(`  Provider: ${colorize(this.configService.getProvider(), 'cyan')}\r\n`);
      process.stdout.write(`  Model:    ${colorize(this.configService.getModel(), 'cyan')}\r\n\r\n`);
      process.stdout.write(`  ${colorize('Tip:', 'muted')} Set via env vars or .cast/config.md\r\n\r\n`);
      return;
    }
    process.stdout.write(`${Colors.yellow}  Model change requires restart${Colors.reset}\r\n`);
  }

  cmdMentionsHelp(): void {
    process.stdout.write('\r\n');
    process.stdout.write(colorize(Icons.file + ' ', 'accent') + colorize('Mentions — inject context with @', 'bold') + '\r\n');
    process.stdout.write(colorize(Box.horizontal.repeat(35), 'subtle') + '\r\n');
    process.stdout.write(`  ${colorize('@path/to/file.ts', 'cyan')}   Read file content\r\n`);
    process.stdout.write(`  ${colorize('@path/to/dir/', 'cyan')}      List directory\r\n`);
    process.stdout.write(`  ${colorize('@https://url.com', 'cyan')}   Fetch URL\r\n`);
    process.stdout.write(`  ${colorize('@git:status', 'cyan')}        Git status\r\n`);
    process.stdout.write(`  ${colorize('@git:diff', 'cyan')}          Git diff\r\n`);
    process.stdout.write(`  ${colorize('@git:log', 'cyan')}           Git log\r\n`);
    process.stdout.write(`  ${colorize('@git:branch', 'cyan')}        List branches\r\n`);
    process.stdout.write('\r\n');
    process.stdout.write(`  ${colorize('Example:', 'muted')} "Explain this @src/main.ts"\r\n`);
    process.stdout.write(`  ${colorize('Tip:', 'muted')} Type @ and suggestions will appear\r\n`);
    process.stdout.write('\r\n');
  }
}
