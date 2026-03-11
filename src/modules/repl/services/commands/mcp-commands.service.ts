import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { McpRegistryService } from '../../../mcp/services/mcp-registry.service';
import { McpClientService } from '../../../mcp/services/mcp-client.service';
import {
  selectWithEsc,
  inputWithEsc,
  confirmWithEsc,
  CancelledPromptError,
} from '../../utils/prompts-with-esc';
import { getAllTemplates, getTemplatesByCategory, getTemplate, McpCategory } from '../../../mcp/catalog/mcp-templates';
import { ISmartInput } from '../smart-input';

@Injectable()
export class McpCommandsService {
  constructor(
    private readonly mcpRegistry: McpRegistryService,
    private readonly mcpClient: McpClientService,
  ) {}

  async cmdMcp(args: string[], smartInput: ISmartInput): Promise<void> {
    const sub = args[0] || 'menu';

    if (sub === 'menu') {
      try {
        await this.showMcpMenu(smartInput);
      } catch (error: any) {
        if (error instanceof CancelledPromptError || error?.name === 'CancelledPromptError') {
          console.log(colorize('\n❌ Cancelled. Returning to chat...\n', 'warning'));
        } else {
          throw error;
        }
      }
      return;
    }

    smartInput.pause();
    try {
      switch (sub) {
        case 'list':
          await this.listServers();
          break;
        case 'tools':
          await this.listTools();
          break;
        case 'add':
          await this.addMcpWizard(smartInput);
          break;
        case 'remove':
          await this.removeMcpWizard(smartInput);
          break;
        case 'test':
          await this.testMcpTool(smartInput);
          break;
        case 'what':
        case 'about':
          this.printWhatIsMcp();
          break;
        case 'help':
        default:
          this.printMcpHelp();
          break;
      }
    } catch (error: any) {
      if (error instanceof CancelledPromptError || error?.name === 'CancelledPromptError') {
        console.log(colorize('\n❌ Cancelled. Returning to chat...\n', 'warning'));
        return;
      }
      throw error;
    } finally {
      smartInput.resume();
    }
  }

  private async showMcpMenu(smartInput: ISmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    while (true) {
      w(`\n${colorize('☁️  MCP Hub', 'bold')}\n`);
      w(`${colorize(Box.horizontal.repeat(30), 'subtle')}\n\n`);

      const summaries = this.mcpRegistry.getServerSummaries();
      const totalTools = summaries.reduce((sum, s) => sum + s.toolCount, 0);

      w(`${colorize('Servers:', 'muted')} ${summaries.length}  `);
      w(`${colorize('Tools:', 'muted')} ${totalTools}\n\n`);

      console.log(colorize('(press ESC to return to chat)\n', 'muted'));

      const action = await this.withEsc(() => smartInput.askChoice('What would you like to do?', [
        { key: '1', label: 'View servers', description: 'List configured MCPs' },
        { key: '2', label: 'View tools', description: 'All available tools' },
        { key: '3', label: 'Connect servers', description: 'Connect/reconnect configured MCPs' },
        { key: '4', label: 'Add server', description: 'Configure new MCP' },
        { key: '5', label: 'Remove server', description: 'Remove MCP' },
        { key: '6', label: 'What is MCP?', description: 'Learn about the protocol' },
        { key: 'q', label: 'Back', description: 'Exit MCP Hub' },
      ]));

      if (action === null) {
        console.log(colorize('\nExiting MCP Hub...\n', 'muted'));
        return;
      }

      let pause = true;
      switch (action) {
        case '1':
          await this.listServers();
          break;
        case '2':
          await this.listTools();
          break;
        case '3':
          await this.connectServers(smartInput as any);
          break;
        case '4':
          await this.addMcpWizard(smartInput);
          pause = false;
          break;
        case '5':
          await this.removeMcpWizard(smartInput);
          pause = false;
          break;
        case '6':
          this.printWhatIsMcp();
          break;
        case 'q':
          return;
      }

      if (pause) {
        await smartInput.question(colorize('\nEnter para continuar...', 'muted'));
      }
    }
  }

  private async withEsc<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (error: any) {
      if (error instanceof CancelledPromptError || error.name === 'CancelledPromptError') {
        return null;
      }
      throw error;
    }
  }

  private async connectServers(smartInput?: ISmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const summaries = this.mcpRegistry.getServerSummaries();

    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('Connect MCP Servers', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(40), 'subtle') + '\r\n\n');

    if (summaries.length === 0) {
      w(`  ${colorize('No servers configured. Use the Add server option.', 'muted')}\r\n\n`);
      return;
    }

    w(`  ${colorize('Connecting ' + summaries.length + ' server(s)...', 'muted')}\r\n\n`);

    const results = await this.mcpRegistry.connectAll();

    for (const [name, ok] of results.entries()) {
      const icon = ok ? colorize('●', 'success') : colorize('○', 'error');
      const status = ok ? colorize('connected', 'success') : colorize('failed', 'error');
      w(`  ${icon} ${colorize(name, 'cyan')} — ${status}\r\n`);

      if (!ok) {
        const config = this.mcpRegistry.getConfig(name);

        if (config?.type === 'http') {
          w(`\r\n  ${colorize('⚠️  ' + name + ': OAuth blocked by server', 'warning')}\r\n`);
          w(`     This server only accepts pre-approved clients (e.g. VS Code, Cursor).\r\n`);
          w(`     Alternative: use the mcp-remote proxy to redirect via an approved client.\r\n\r\n`);

        } else if (config?.type === 'stdio' && smartInput) {
          const template = getTemplate(name);
          if (template?.credentials?.length) {
            const missing = template.credentials.filter(cred => {
              if (cred.isArg) return false;
              return !config.env?.[cred.envVar];
            });

            if (missing.length > 0) {
              w(`\r\n  ${colorize('🔑 Credentials required for ' + name, 'warning')}\r\n\r\n`);

              const mcpDir = path.join(process.cwd(), '.cast', 'mcp');
              const filePath = path.join(mcpDir, `${name}.json`);
              const updatedConfig = JSON.parse(JSON.stringify(config));
              if (!updatedConfig.env) updatedConfig.env = {};

              for (const cred of missing) {
                const value = await smartInput.question(
                  colorize(`  ${cred.name} (${cred.placeholder}): `, 'cyan'),
                );
                if (value.trim()) {
                  updatedConfig.env[cred.envVar] = value.trim();
                }
              }

              fs.writeFileSync(filePath, JSON.stringify({ [name]: updatedConfig }, null, 2));
              this.mcpRegistry.registerMcp(name, updatedConfig);

              w(`\r\n  ${colorize('Reconnecting ' + name + '...', 'muted')}\r\n`);
              const retryOk = await this.mcpRegistry.connectMcp(name);
              const retryIcon = retryOk ? colorize('●', 'success') : colorize('○', 'error');
              const retryStatus = retryOk ? colorize('connected', 'success') : colorize('failed — check the credential', 'error');
              w(`  ${retryIcon} ${colorize(name, 'cyan')} — ${retryStatus}\r\n\r\n`);
            } else {
              w(`  ${colorize('Check that the server is available and try again.', 'muted')}\r\n\r\n`);
            }
          }
        }
      }
    }

    const finalResults = await this.mcpRegistry.connectAll();
    const connected = [...finalResults.values()].filter(Boolean).length;
    w(`  ${colorize(`${connected}/${finalResults.size} connected`, connected === finalResults.size ? 'success' : 'warning')}\r\n\r\n`);
  }

  private async listServers(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const summaries = this.mcpRegistry.getServerSummaries();

    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('MCP Servers', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(40), 'subtle') + '\r\n\n');

    if (summaries.length === 0) {
      w(`  ${colorize('No MCP servers configured', 'muted')}\r\n\n`);
      w(`  ${colorize('What is MCP?', 'cyan')} → /mcp what\r\n`);
      w(`  ${colorize('How to add?', 'cyan')} → /mcp add\r\n\n`);
      return;
    }

    for (const s of summaries) {
      const statusIcon = s.status === 'connected' ? colorize('●', 'success') : colorize('○', 'error');
      const statusText = s.status === 'connected' ? colorize('connected', 'success') : colorize(s.status, 'error');

      w(`  ${statusIcon} ${colorize(s.name, 'cyan')} ${colorize(`(${s.transport})`, 'muted')}\r\n`);
      w(`    Status: ${statusText} | Tools: ${s.toolCount}\r\n`);

      if (s.toolCount > 0) {
        const toolNames = s.toolDescriptions.slice(0, 3).map(t => t.name.split('_').pop()).join(', ');
        const more = s.toolCount > 3 ? ` +${s.toolCount - 3} more` : '';
        w(`    Tools: ${colorize(toolNames + more, 'muted')}\r\n`);
      }
      w('\r\n');
    }
  }

  private async listTools(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const summaries = this.mcpRegistry.getServerSummaries();
    const totalTools = summaries.reduce((sum, s) => sum + s.toolCount, 0);

    w('\r\n');
    w(colorize(Icons.tool + ' ', 'accent') + colorize(`MCP Tools (${totalTools})`, 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(40), 'subtle') + '\r\n');

    if (totalTools === 0) {
      w(`\n  ${colorize('No tools available', 'muted')}\r\n\n`);
      return;
    }

    for (const server of summaries) {
      if (server.toolCount === 0) continue;
      
      w(`\n  ${colorize(server.name, 'bold')} ${colorize(`(${server.transport}, ${server.status})`, 'muted')}\r\n`);
      w(`  ${colorize(Box.horizontal.repeat(30), 'subtle')}\r\n`);
      
      for (const td of server.toolDescriptions) {
        const shortName = td.name.replace(`${server.name}_`, '');
        w(`    ${colorize('•', 'primary')} ${colorize(shortName, 'cyan')}\r\n`);
        const desc = td.description.length > 70 
          ? td.description.slice(0, 67) + '...' 
          : td.description;
        w(`      ${colorize(desc, 'muted')}\r\n`);
      }
    }
    w('\r\n');
  }

  private async addMcpWizard(smartInput: ISmartInput): Promise<void> {
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');

    if (!fs.existsSync(mcpDir)) {
      fs.mkdirSync(mcpDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('Add MCP Server', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    console.log(colorize('(press ESC to cancel at any time)\r\n', 'muted'));

    const category = await selectWithEsc<McpCategory | 'custom'>({
      message: 'Choose a category:',
      choices: [
        { name: '🔧 Dev Tools (GitHub, Linear, Jira, Sentry, Docker)', value: 'dev' as McpCategory },
        { name: '🎨 Design (Figma)', value: 'design' as McpCategory },
        { name: '🗄️  Data (PostgreSQL, MongoDB, Redis, Supabase)', value: 'data' as McpCategory },
        { name: '🔍 Search (Brave, Exa, Perplexity, Context7)', value: 'search' as McpCategory },
        { name: '☁️  Cloud (Vercel, Cloudflare, AWS S3)', value: 'cloud' as McpCategory },
        { name: '📋 Productivity (Slack, Notion, Google Drive, Maps)', value: 'productivity' as McpCategory },
        { name: '💳 Payments (Stripe, Twilio)', value: 'payments' as McpCategory },
        { name: '🌐 Browser (Puppeteer)', value: 'browser' as McpCategory },
        { name: '📁 Filesystem', value: 'filesystem' as McpCategory },
        { name: '➕ Manual configuration', value: 'custom' },
      ],
    });

    if (category === null) {
      w(colorize('\r\n  ❌ Cancelled.\r\n\r\n', 'warning'));
      return;
    }

    let config: Record<string, any> = {};
    let name: string;

    if (category !== 'custom') {
      const templates = getTemplatesByCategory(category);
      const templateId = await selectWithEsc<string>({
        message: 'Choose a server:',
        choices: templates.map(t => ({
          name: `${t.name} - ${t.description}`,
          value: t.id,
        })),
      });

      if (templateId === null) {
        w(colorize('\r\n  ❌ Cancelled.\r\n\r\n', 'warning'));
        return;
      }

      const template = getTemplate(templateId);
      if (!template) {
        w(colorize('\r\n  ❌ Template not found.\r\n\r\n', 'error'));
        return;
      }

      name = template.id;
      config = JSON.parse(JSON.stringify(template.config)); // Deep clone

      if (template.credentials.length > 0) {
        w(`\r\n${colorize('📝 Configuration:', 'bold')}\r\n`);

        for (const cred of template.credentials) {
          if (cred.isArg) {
            const value = await smartInput.question(colorize(`  ${cred.name} (${cred.placeholder}): `, 'cyan'));
            if (!value.trim() && cred.required) {
              w(colorize('\r\n  ❌ Required field!\r\n\r\n', 'error'));
              return;
            }
            if (value.trim()) {
              config.args.push(value.trim());
            }
          } else {
            const value = await smartInput.question(colorize(`  ${cred.name} (${cred.placeholder}): `, 'cyan'));
            if (!value.trim() && cred.required) {
              w(colorize('\r\n  ❌ Required field!\r\n\r\n', 'error'));
              return;
            }
            if (value.trim()) {
              if (!config.env) config.env = {};
              config.env[cred.envVar] = value.trim();
            }
          }
        }
      }

      const filePath = path.join(mcpDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ [name]: config }, null, 2));
      w(`\r\n${colorize('✓', 'success')} MCP configured: ${colorize(filePath, 'accent')}\r\n`);

      if (name === 'figma') {
        w('\r\n');
        w(colorize('  ─────────────────────────────────────────\r\n', 'subtle'));
        w(colorize('   Tutorial — Figma Desktop MCP\r\n', 'bold'));
        w(colorize('  ─────────────────────────────────────────\r\n', 'subtle'));
        w('\r\n');
        w(colorize('  Step 1: ', 'accent') + 'Install Figma Desktop\r\n');
        w(colorize('          https://www.figma.com/downloads/\r\n', 'muted'));
        w('\r\n');
        w(colorize('  Step 2: ', 'accent') + 'Open any Design file in Figma\r\n');
        w('\r\n');
        w(colorize('  Step 3: ', 'accent') + 'Enable Dev Mode\r\n');
        w(colorize('          Click the "<>" button in the top-right corner\r\n', 'muted'));
        w('\r\n');
        w(colorize('  Step 4: ', 'accent') + 'Enable the MCP server\r\n');
        w(colorize('          Inspect panel → MCP section\r\n', 'muted'));
        w(colorize('          Toggle "Enable desktop MCP server"\r\n', 'muted'));
        w('\r\n');
        w(colorize('  Step 5: ', 'accent') + 'Connect via Cast\r\n');
        w(colorize('          Restart Cast and use /mcp → Connect servers\r\n', 'muted'));
        w('\r\n');
        w(colorize('  ─────────────────────────────────────────\r\n', 'subtle'));
        w('\r\n');
      } else if (template.config.type === 'http') {
        w(colorize('\r\n  ⚠️  HTTP/OAuth server detected!\r\n', 'warning'));
        w(colorize('     Authentication may be required after connecting.\r\n\r\n', 'muted'));
      }

      w(colorize('  Restart Cast to connect\r\n\r\n', 'muted'));
      return;
    }

    const nameInput = await inputWithEsc({
      message: colorize('  Server name: ', 'cyan'),
    });
    if (nameInput === null || !nameInput.trim()) {
      w(colorize('\r\n  ❌ Cancelled\r\n', 'muted'));
      return;
    }
    name = nameInput;

    const typeChoice = await smartInput.askChoice('  Transport type:', [
      { key: 'stdio', label: 'stdio', description: 'Local process (npx, node, python)' },
      { key: 'http', label: 'http', description: 'HTTP endpoint' },
    ]);

    config.type = typeChoice;

    if (typeChoice === 'stdio') {
      const command = await inputWithEsc({
        message: colorize('  Command: ', 'cyan'),
      });
      if (command === null) {
        w(colorize('\r\n  ❌ Cancelled\r\n', 'muted'));
        return;
      }

      const argsInput = await inputWithEsc({
        message: colorize('  Arguments (comma-separated): ', 'cyan'),
      });
      if (argsInput === null) {
        w(colorize('\r\n  ❌ Cancelled\r\n', 'muted'));
        return;
      }

      config.command = command.trim();
      config.args = argsInput.trim() ? argsInput.split(',').map((a: string) => a.trim()) : [];

      const hasEnv = await confirmWithEsc({ message: 'Need environment variables?', default: false });
      if (hasEnv === null) {
        w(colorize('\r\n  ❌ Cancelled\r\n', 'muted'));
        return;
      }
      if (hasEnv) {
        config.env = {};
        while (true) {
          const key = await inputWithEsc({
            message: colorize('  Variable name (or empty to stop): ', 'cyan'),
          });
          if (key === null) {
            w(colorize('\r\n  ❌ Cancelled\r\n', 'muted'));
            return;
          }
          if (!key) break;

          const value = await inputWithEsc({
            message: colorize(`  Value for ${key}: `, 'cyan'),
          });
          if (value === null) {
            w(colorize('\r\n  ❌ Cancelled\r\n', 'muted'));
            return;
          }
          config.env[key] = value;
        }
      }
    } else {
      const endpoint = await inputWithEsc({
        message: colorize('  Endpoint URL: ', 'cyan'),
      });
      if (endpoint === null) {
        w(colorize('\r\n  ❌ Cancelled\r\n', 'muted'));
        return;
      }
      config.endpoint = endpoint.trim();
    }

    const filePath = path.join(mcpDir, `${name.trim().toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ [name.trim()]: config }, null, 2));

    w(`\r\n${colorize('✓', 'success')} Config saved: ${colorize(filePath, 'accent')}\r\n`);
    w(colorize('  Restart Cast to connect\r\n\r\n', 'muted'));
  }

  private async removeMcpWizard(smartInput: ISmartInput): Promise<void> {
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');

    if (!fs.existsSync(mcpDir)) {
      console.log(colorize('\nNo MCP servers configured\n', 'muted'));
      return;
    }

    const files = fs.readdirSync(mcpDir).filter((f: string) => f.endsWith('.json'));
    if (files.length === 0) {
      console.log(colorize('\nNo MCP servers configured\n', 'muted'));
      return;
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('Remove MCP Server', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(25), 'subtle') + '\r\n\n');

    const toRemove = await selectWithEsc<string>({
      message: 'Which server would you like to remove?',
      choices: files.map((f: string) => ({
        name: f.replace('.json', ''),
        value: f,
      })),
    });

    if (toRemove === null) {
      w(colorize('\r\n  ❌ Cancelled\r\n\r\n', 'muted'));
      return;
    }

    const confirmRemove = await confirmWithEsc({
      message: `Are you sure you want to remove "${toRemove.replace('.json', '')}"?`,
      default: false,
    });

    if (confirmRemove === null) {
      w(colorize('\r\n  ❌ Cancelled\r\n\r\n', 'muted'));
      return;
    }

    if (confirmRemove) {
      fs.unlinkSync(path.join(mcpDir, toRemove));
      console.log(colorize(`\n✓ Server removed\n`, 'success'));
      console.log(colorize('Restart required for changes to take effect.\n', 'warning'));
    }
  }

  private async testMcpTool(smartInput: ISmartInput): Promise<void> {
    console.log(colorize('\nComing soon!\n', 'muted'));
  }

  private printWhatIsMcp(): void {
    const w = (s: string) => process.stdout.write(s);

    w(`\n${colorize('☁️  What is MCP?', 'bold')}\n`);
    w(`${colorize(Box.horizontal.repeat(50), 'subtle')}\n\n`);

    w(`${colorize('Model Context Protocol (MCP)', 'cyan')} is an open protocol\n`);
    w(`that allows AI assistants to connect to data sources\n`);
    w(`and external tools in a standardized way.\n\n`);

    w(`${colorize('How it works:', 'bold')}\n`);
    w(`  ${colorize('1.', 'primary')} An MCP server exposes tools\n`);
    w(`  ${colorize('2.', 'primary')} Cast connects to that server\n`);
    w(`  ${colorize('3.', 'primary')} The AI can call those tools automatically\n\n`);

    w(`${colorize('Usage examples:', 'bold')}\n`);
    w(`  ${colorize('•', 'muted')} GitHub: create issues, read PRs, make commits\n`);
    w(`  ${colorize('•', 'muted')} Filesystem: access files outside the project\n`);
    w(`  ${colorize('•', 'muted')} PostgreSQL: query databases\n`);
    w(`  ${colorize('•', 'muted')} Brave: search for up-to-date information on the web\n\n`);

    w(`${colorize('Advantages:', 'bold')}\n`);
    w(`  ${colorize('✓', 'success')} Security: the user controls access\n`);
    w(`  ${colorize('✓', 'success')} Flexibility: any language/framework\n`);
    w(`  ${colorize('✓', 'success')} Open standard: no vendor lock-in\n\n`);

    w(`${colorize('Want to create your own MCP?', 'accent')}\n`);
    w(`  → /mcp help (full guide)\n`);
    w(`  → https://modelcontextprotocol.io\n\n`);
  }

  private printHowToCreate(): void {
    const w = (s: string) => process.stdout.write(s);

    w(`\n${colorize('🛠️  How to Create an MCP Server', 'bold')}\n`);
    w(`${colorize(Box.horizontal.repeat(50), 'subtle')}\n\n`);

    w(`${colorize('Option 1: TypeScript/JavaScript (easiest)', 'bold')}\n\n`);
    w(`${colorize('1.', 'primary')} Create a project:\n`);
    w(`   ${colorize('mkdir my-mcp && cd my-mcp', 'muted')}\n`);
    w(`   ${colorize('npm init -y', 'muted')}\n`);
    w(`   ${colorize('npm install @modelcontextprotocol/sdk zod', 'muted')}\n\n`);

    w(`${colorize('2.', 'primary')} Create the server (index.ts):\n`);
    w(colorize(`   import { Server } from '@modelcontextprotocol/sdk/server/index.js';\n`, 'muted'));
    w(colorize(`   import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';\n`, 'muted'));
    w(colorize(`\n`, 'muted'));
    w(colorize(`   const server = new Server(\n`, 'muted'));
    w(colorize(`     { name: 'my-mcp', version: '1.0.0' },\n`, 'muted'));
    w(colorize(`     { capabilities: { tools: {} } }\n`, 'muted'));
    w(colorize(`   );\n`, 'muted'));
    w(colorize(`\n`, 'muted'));
    w(colorize(`   server.setRequestHandler(ListToolsRequestSchema, async () => ({\n`, 'muted'));
    w(colorize(`     tools: [{\n`, 'muted'));
    w(colorize(`       name: 'my_tool',\n`, 'muted'));
    w(colorize(`       description: 'Does something useful',\n`, 'muted'));
    w(colorize(`       inputSchema: {\n`, 'muted'));
    w(colorize(`         type: 'object',\n`, 'muted'));
    w(colorize(`         properties: { name: { type: 'string' } },\n`, 'muted'));
    w(colorize(`         required: ['name']\n`, 'muted'));
    w(colorize(`       }\n`, 'muted'));
    w(colorize(`     }]\n`, 'muted'));
    w(colorize(`   }));\n`, 'muted'));
    w(colorize(`\n`, 'muted'));
    w(colorize(`   server.setRequestHandler(CallToolRequestSchema, async (req) => {\n`, 'muted'));
    w(colorize(`     const args = req.params.arguments;\n`, 'muted'));
    w(colorize(`     return { content: [{ type: 'text', text: 'Result!' }] };\n`, 'muted'));
    w(colorize(`   });\n`, 'muted'));
    w(colorize(`\n`, 'muted'));
    w(colorize(`   const transport = new StdioServerTransport();\n`, 'muted'));
    w(colorize(`   await server.connect(transport);\n`, 'muted'));
    w(`\n`);

    w(`${colorize('Option 2: Python', 'bold')}\n\n`);
    w(`   ${colorize('pip install mcp', 'muted')}\n\n`);
    w(`   See: ${colorize('https://github.com/modelcontextprotocol/python-sdk', 'accent')}\n\n`);

    w(`${colorize('3.', 'primary')} Publish to npm (optional):\n`);
    w(`   Others can use it with: ${colorize('npx -y your-mcp-server', 'muted')}\n\n`);

    w(`${colorize('Resources:', 'bold')}\n`);
    w(`  ${colorize('•', 'muted')} Documentation: https://modelcontextprotocol.io\n`);
    w(`  ${colorize('•', 'muted')} TypeScript SDK: @modelcontextprotocol/sdk\n`);
    w(`  ${colorize('•', 'muted')} Examples: github.com/modelcontextprotocol/servers\n\n`);
  }

  private printMcpHelp(): void {
    const w = (s: string) => process.stdout.write(s);

    w(`\n${colorize('☁️  MCP - Quick Guide', 'bold')}\n`);
    w(`${colorize(Box.horizontal.repeat(40), 'subtle')}\n\n`);

    w(`${colorize('Commands:', 'bold')}\n`);
    w(`  ${colorize('/mcp', 'cyan')}          → Interactive menu\n`);
    w(`  ${colorize('/mcp list', 'cyan')}     → View servers\n`);
    w(`  ${colorize('/mcp tools', 'cyan')}    → View tools\n`);
    w(`  ${colorize('/mcp add', 'cyan')}      → Add server\n`);
    w(`  ${colorize('/mcp remove', 'cyan')}   → Remove server\n`);
    w(`  ${colorize('/mcp what', 'cyan')}     → What is MCP?\n\n`);

    w(`${colorize('Popular servers:', 'bold')}\n`);
    w(`  ${colorize('@modelcontextprotocol/server-github', 'muted')}\n`);
    w(`    Access repositories, issues, PRs\n\n`);
    w(`  ${colorize('@figma/mcp-server (HTTP)', 'muted')}\n`);
    w(`    Access designs and components (requires OAuth)\n\n`);
    w(`  ${colorize('@modelcontextprotocol/server-filesystem', 'muted')}\n`);
    w(`    Read/write local files\n\n`);
    w(`  ${colorize('@modelcontextprotocol/server-postgres', 'muted')}\n`);
    w(`    Query PostgreSQL databases\n\n`);
    w(`  ${colorize('@modelcontextprotocol/server-brave-search', 'muted')}\n`);
    w(`    Web search via Brave\n\n`);

    w(`${colorize('HTTP servers (OAuth):', 'bold')}\n`);
    w(`  Some servers like Figma use HTTP + OAuth.\n`);
    w(`  After adding, authentication will be requested.\n\n`);

    w(`${colorize('Manual configuration:', 'bold')}\n`);
    w(`  Create: ${colorize('.cast/mcp/name.json', 'cyan')}\n\n`);
    w(colorize(`  {\n`, 'muted'));
    w(colorize(`    "my-mcp": {\n`, 'muted'));
    w(colorize(`      "type": "stdio",\n`, 'muted'));
    w(colorize(`      "command": "npx",\n`, 'muted'));
    w(colorize(`      "args": ["-y", "@modelcontextprotocol/server-github"],\n`, 'muted'));
    w(colorize(`      "env": { "GITHUB_TOKEN": "..." }\n`, 'muted'));
    w(colorize(`    }\n`, 'muted'));
    w(colorize(`  }\n`, 'muted'));
    w(`\n`);
  }
}
