import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { colorize } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';
import { McpRegistryService } from '../../../mcp/services/mcp-registry.service';
import { McpClientService } from '../../../mcp/services/mcp-client.service';
import {
  selectWithEsc,
  inputWithEsc,
  confirmWithEsc,
  CancelledPromptError,
} from '../../utils/prompts-with-esc';
import { getTemplatesByCategory, getTemplate, McpCategory } from '../../../mcp/catalog/mcp-templates';
import { ISmartInput } from '../smart-input';

@Injectable()
export class McpCommandsService {
  private readonly ui = new CommandUiService();

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
          process.stdout.write(this.ui.warning('Cancelled. Returning to chat...'));
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
        process.stdout.write(this.ui.warning('Cancelled. Returning to chat...'));
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
      const summaries = this.mcpRegistry.getServerSummaries();
      const totalTools = summaries.reduce((sum, s) => sum + s.toolCount, 0);

      w(this.ui.panel({
        title: 'MCP Hub',
        subtitle: 'tools and servers',
        sections: [
          {
            rows: [
              { label: 'Servers', value: colorize(summaries.length.toString(), 'cyan') },
              { label: 'Tools', value: colorize(totalTools.toString(), 'cyan') },
            ],
          },
        ],
        footer: 'Press ESC to return to chat.',
      }));

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
        w(this.ui.warning('Exiting MCP Hub...'));
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

    w(this.ui.panel({
      title: 'Connect MCP Servers',
      sections: [{ lines: [colorize('Connecting configured MCP servers.', 'muted')] }],
    }));

    if (summaries.length === 0) {
      w(this.ui.warning('No servers configured. Use /mcp add first.'));
      return;
    }

    w(`  ${colorize('Connecting ' + summaries.length + ' server(s)...', 'muted')}\r\n\n`);

    const results = await this.mcpRegistry.connectAll();

    for (const [name, ok] of results.entries()) {
      const icon = ok ? colorize('●', 'success') : colorize('○', 'error');
      const status = ok ? colorize('connected', 'success') : colorize('failed', 'error');
      w(`  ${icon} ${colorize(name, 'cyan')} - ${status}\r\n`);

      if (!ok) {
        const config = this.mcpRegistry.getConfig(name);

        if (config?.type === 'http') {
          w(`\r\n  ${colorize(name + ': OAuth blocked by server', 'warning')}\r\n`);
          w('     This server only accepts pre-approved clients (e.g. VS Code, Cursor).\r\n');
          w('     Alternative: use the mcp-remote proxy to redirect via an approved client.\r\n\r\n');

        } else if (config?.type === 'stdio' && smartInput) {
          const template = getTemplate(name);
          if (template?.credentials?.length) {
            const missing = template.credentials.filter(cred => {
              if (cred.isArg) return false;
              return !config.env?.[cred.envVar];
            });

            if (missing.length > 0) {
              w(`\r\n  ${colorize('Credentials required for ' + name, 'warning')}\r\n\r\n`);

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
              const retryStatus = retryOk ? colorize('connected', 'success') : colorize('failed - check the credential', 'error');
              w(`  ${retryIcon} ${colorize(name, 'cyan')} - ${retryStatus}\r\n\r\n`);
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

    if (summaries.length === 0) {
      w(this.ui.panel({
        title: 'MCP Servers',
        sections: [{ lines: [colorize('No MCP servers configured.', 'muted')] }],
        footer: 'Use /mcp what to learn more or /mcp add to configure one.',
      }));
      return;
    }

    const lines: string[] = [];
    for (const s of summaries) {
      const statusIcon = s.status === 'connected' ? colorize('●', 'success') : colorize('○', 'error');
      const statusText = s.status === 'connected' ? colorize('connected', 'success') : colorize(s.status, 'error');

      lines.push(`${statusIcon} ${colorize(s.name, 'cyan')} ${colorize(`(${s.transport})`, 'muted')} ${statusText} ${colorize(`${s.toolCount} tools`, 'muted')}`);

      if (s.toolCount > 0) {
        const toolNames = s.toolDescriptions.slice(0, 3).map(t => t.name.split('_').pop()).join(', ');
        const more = s.toolCount > 3 ? ` +${s.toolCount - 3} more` : '';
        lines.push(`  ${colorize(toolNames + more, 'muted')}`);
      }
    }

    w(this.ui.panel({
      title: 'MCP Servers',
      subtitle: `${summaries.length} configured`,
      sections: [{ lines }],
    }));
  }

  private async listTools(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const summaries = this.mcpRegistry.getServerSummaries();
    const totalTools = summaries.reduce((sum, s) => sum + s.toolCount, 0);

    if (totalTools === 0) {
      w(this.ui.panel({
        title: 'MCP Tools',
        subtitle: '0 available',
        sections: [{ lines: [colorize('No tools available. Connect or add an MCP server first.', 'muted')] }],
      }));
      return;
    }

    const sections: Array<{ title: string; lines: string[] }> = [];
    for (const server of summaries) {
      if (server.toolCount === 0) continue;

      sections.push({
        title: `${server.name} (${server.transport}, ${server.status})`,
        lines: server.toolDescriptions.map((td) => {
          const shortName = td.name.replace(`${server.name}_`, '');
          const desc = td.description.length > 70 
            ? td.description.slice(0, 67) + '...' 
            : td.description;
          return `${colorize(shortName, 'cyan')}  ${colorize(desc, 'muted')}`;
        }),
      });
    }

    w(this.ui.panel({
      title: 'MCP Tools',
      subtitle: `${totalTools} available`,
      sections,
    }));
  }

  private async addMcpWizard(smartInput: ISmartInput): Promise<void> {
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');

    if (!fs.existsSync(mcpDir)) {
      fs.mkdirSync(mcpDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w(this.ui.panel({
      title: 'Add MCP Server',
      sections: [{ lines: [colorize('Choose a template or add a manual configuration.', 'muted')] }],
      footer: 'Press ESC to cancel at any time.',
    }));

    const category = await selectWithEsc<McpCategory | 'custom'>({
      message: 'Choose a category:',
      choices: [
        { name: 'Dev Tools (GitHub, Linear, Jira, Sentry, Docker)', value: 'dev' as McpCategory },
        { name: 'Design (Figma)', value: 'design' as McpCategory },
        { name: 'Data (PostgreSQL, MongoDB, Redis, Supabase)', value: 'data' as McpCategory },
        { name: 'Search (Brave, Exa, Perplexity, Context7)', value: 'search' as McpCategory },
        { name: 'Cloud (Vercel, Cloudflare, AWS S3)', value: 'cloud' as McpCategory },
        { name: 'Productivity (Slack, Notion, Google Drive, Maps)', value: 'productivity' as McpCategory },
        { name: 'Payments (Stripe, Twilio)', value: 'payments' as McpCategory },
        { name: 'Browser (Puppeteer)', value: 'browser' as McpCategory },
        { name: 'Filesystem', value: 'filesystem' as McpCategory },
        { name: 'Manual configuration', value: 'custom' },
      ],
    });

    if (category === null) {
      w(this.ui.warning('Cancelled.'));
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
        w(this.ui.warning('Cancelled.'));
        return;
      }

      const template = getTemplate(templateId);
      if (!template) {
        w(this.ui.error('Template not found.'));
        return;
      }

      name = template.id;
      config = JSON.parse(JSON.stringify(template.config)); // Deep clone

      if (template.credentials.length > 0) {
        w(this.ui.panel({
          title: 'Configuration',
          sections: [{ lines: [colorize('Enter the required values for this MCP server.', 'muted')] }],
        }));

        for (const cred of template.credentials) {
          if (cred.isArg) {
            const value = await smartInput.question(colorize(`  ${cred.name} (${cred.placeholder}): `, 'cyan'));
            if (!value.trim() && cred.required) {
              w(this.ui.error('Required field.'));
              return;
            }
            if (value.trim()) {
              config.args.push(value.trim());
            }
          } else {
            const value = await smartInput.question(colorize(`  ${cred.name} (${cred.placeholder}): `, 'cyan'));
            if (!value.trim() && cred.required) {
              w(this.ui.error('Required field.'));
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
      w(this.ui.success(`MCP configured: ${filePath}`));

      if (name === 'figma') {
        w(this.ui.panel({
          title: 'Figma Desktop MCP',
          subtitle: 'setup',
          sections: [
            {
              lines: [
                '1. Install Figma Desktop: https://www.figma.com/downloads/',
                '2. Open any design file in Figma.',
                '3. Enable Dev Mode using the top-right <> button.',
                '4. Inspect panel > MCP section > Enable desktop MCP server.',
                '5. Restart Cast and use /mcp to connect servers.',
              ],
            },
          ],
        }));
      } else if (template.config.type === 'http') {
        w(this.ui.warning('HTTP/OAuth server detected. Authentication may be required after connecting.'));
      }

      w(colorize('  Restart Cast to connect\r\n\r\n', 'muted'));
      return;
    }

    const nameInput = await inputWithEsc({
      message: colorize('  Server name: ', 'cyan'),
    });
    if (nameInput === null || !nameInput.trim()) {
      w(this.ui.warning('Cancelled.'));
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
        w(this.ui.warning('Cancelled.'));
        return;
      }

      const argsInput = await inputWithEsc({
        message: colorize('  Arguments (comma-separated): ', 'cyan'),
      });
      if (argsInput === null) {
        w(this.ui.warning('Cancelled.'));
        return;
      }

      config.command = command.trim();
      config.args = argsInput.trim() ? argsInput.split(',').map((a: string) => a.trim()) : [];

      const hasEnv = await confirmWithEsc({ message: 'Need environment variables?', default: false });
      if (hasEnv === null) {
        w(this.ui.warning('Cancelled.'));
        return;
      }
      if (hasEnv) {
        config.env = {};
        while (true) {
          const key = await inputWithEsc({
            message: colorize('  Variable name (or empty to stop): ', 'cyan'),
          });
          if (key === null) {
            w(this.ui.warning('Cancelled.'));
            return;
          }
          if (!key) break;

          const value = await inputWithEsc({
            message: colorize(`  Value for ${key}: `, 'cyan'),
          });
          if (value === null) {
            w(this.ui.warning('Cancelled.'));
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
        w(this.ui.warning('Cancelled.'));
        return;
      }
      config.endpoint = endpoint.trim();
    }

    const filePath = path.join(mcpDir, `${name.trim().toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ [name.trim()]: config }, null, 2));

    w(this.ui.success(`Config saved: ${filePath}`));
    w(colorize('  Restart Cast to connect\r\n\r\n', 'muted'));
  }

  private async removeMcpWizard(_smartInput: ISmartInput): Promise<void> {
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');

    if (!fs.existsSync(mcpDir)) {
      process.stdout.write(this.ui.warning('No MCP servers configured.'));
      return;
    }

    const files = fs.readdirSync(mcpDir).filter((f: string) => f.endsWith('.json'));
    if (files.length === 0) {
      process.stdout.write(this.ui.warning('No MCP servers configured.'));
      return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(this.ui.panel({
      title: 'Remove MCP Server',
      subtitle: `${files.length} configured`,
      sections: [{ lines: [colorize('Select the server configuration to remove.', 'muted')] }],
    }));

    const toRemove = await selectWithEsc<string>({
      message: 'Which server would you like to remove?',
      choices: files.map((f: string) => ({
        name: f.replace('.json', ''),
        value: f,
      })),
    });

    if (toRemove === null) {
      w(this.ui.warning('Cancelled.'));
      return;
    }

    const confirmRemove = await confirmWithEsc({
      message: `Are you sure you want to remove "${toRemove.replace('.json', '')}"?`,
      default: false,
    });

    if (confirmRemove === null) {
      w(this.ui.warning('Cancelled.'));
      return;
    }

    if (confirmRemove) {
      fs.unlinkSync(path.join(mcpDir, toRemove));
      process.stdout.write(this.ui.success('Server removed. Restart required for changes to take effect.'));
    }
  }

  private async testMcpTool(_smartInput: ISmartInput): Promise<void> {
    process.stdout.write(this.ui.warning('MCP tool testing is coming soon.'));
  }

  private printWhatIsMcp(): void {
    process.stdout.write(this.ui.panel({
      title: 'What is MCP?',
      subtitle: 'Model Context Protocol',
      sections: [
        {
          lines: [
            `${colorize('MCP', 'cyan')} lets Cast connect to external data sources and tools through a standard protocol.`,
          ],
        },
        {
          title: 'How it works',
          lines: [
            `${colorize('1.', 'primary')} An MCP server exposes tools`,
            `${colorize('2.', 'primary')} Cast connects to that server`,
            `${colorize('3.', 'primary')} The AI can call those tools when useful`,
          ],
        },
        {
          title: 'Examples',
          lines: [
            'GitHub: issues, PRs, commits',
            'Filesystem: files outside the project',
            'PostgreSQL: database queries',
            'Brave: web search',
          ],
        },
      ],
      footer: 'Use /mcp help for setup. Docs: https://modelcontextprotocol.io',
    }));
  }

  private printHowToCreate(): void {
    const w = (s: string) => process.stdout.write(s);

    w(this.ui.panel({
      title: 'Create an MCP Server',
      subtitle: 'quick guide',
      sections: [
        {
          lines: [
            `${colorize('TypeScript', 'cyan')} is the easiest starting point for local stdio servers.`,
            `${colorize('Python', 'cyan')} works well with the official mcp package.`,
          ],
        },
      ],
    }));

    w(`${colorize('Option 1: TypeScript/JavaScript (easiest)', 'bold')}\n\n`);
    w(`${colorize('1.', 'primary')} Create a project:\n`);
    w(`   ${colorize('mkdir my-mcp && cd my-mcp', 'muted')}\n`);
    w(`   ${colorize('npm init -y', 'muted')}\n`);
    w(`   ${colorize('npm install @modelcontextprotocol/sdk zod', 'muted')}\n\n`);

    w(`${colorize('2.', 'primary')} Create the server (index.ts):\n`);
    w(colorize('   import { Server } from \'@modelcontextprotocol/sdk/server/index.js\';\n', 'muted'));
    w(colorize('   import { StdioServerTransport } from \'@modelcontextprotocol/sdk/server/stdio.js\';\n', 'muted'));
    w(colorize('\n', 'muted'));
    w(colorize('   const server = new Server(\n', 'muted'));
    w(colorize('     { name: \'my-mcp\', version: \'1.0.0\' },\n', 'muted'));
    w(colorize('     { capabilities: { tools: {} } }\n', 'muted'));
    w(colorize('   );\n', 'muted'));
    w(colorize('\n', 'muted'));
    w(colorize('   server.setRequestHandler(ListToolsRequestSchema, async () => ({\n', 'muted'));
    w(colorize('     tools: [{\n', 'muted'));
    w(colorize('       name: \'my_tool\',\n', 'muted'));
    w(colorize('       description: \'Does something useful\',\n', 'muted'));
    w(colorize('       inputSchema: {\n', 'muted'));
    w(colorize('         type: \'object\',\n', 'muted'));
    w(colorize('         properties: { name: { type: \'string\' } },\n', 'muted'));
    w(colorize('         required: [\'name\']\n', 'muted'));
    w(colorize('       }\n', 'muted'));
    w(colorize('     }]\n', 'muted'));
    w(colorize('   }));\n', 'muted'));
    w(colorize('\n', 'muted'));
    w(colorize('   server.setRequestHandler(CallToolRequestSchema, async (req) => {\n', 'muted'));
    w(colorize('     const args = req.params.arguments;\n', 'muted'));
    w(colorize('     return { content: [{ type: \'text\', text: \'Result!\' }] };\n', 'muted'));
    w(colorize('   });\n', 'muted'));
    w(colorize('\n', 'muted'));
    w(colorize('   const transport = new StdioServerTransport();\n', 'muted'));
    w(colorize('   await server.connect(transport);\n', 'muted'));
    w('\n');

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
    process.stdout.write(this.ui.panel({
      title: 'MCP',
      subtitle: 'quick guide',
      sections: [
        {
          title: 'Commands',
          lines: [
            `${colorize('/mcp', 'cyan')}          ${colorize('interactive menu', 'muted')}`,
            `${colorize('/mcp list', 'cyan')}     ${colorize('view servers', 'muted')}`,
            `${colorize('/mcp tools', 'cyan')}    ${colorize('view tools', 'muted')}`,
            `${colorize('/mcp add', 'cyan')}      ${colorize('add server', 'muted')}`,
            `${colorize('/mcp remove', 'cyan')}   ${colorize('remove server', 'muted')}`,
            `${colorize('/mcp what', 'cyan')}     ${colorize('protocol overview', 'muted')}`,
          ],
        },
        {
          title: 'Popular servers',
          lines: [
            '@modelcontextprotocol/server-github - repositories, issues, PRs',
            '@figma/mcp-server - designs and components',
            '@modelcontextprotocol/server-filesystem - local files',
            '@modelcontextprotocol/server-postgres - database queries',
            '@modelcontextprotocol/server-brave-search - web search',
          ],
        },
        {
          title: 'Manual config',
          lines: [
            `Create ${colorize('.cast/mcp/name.json', 'cyan')} with type, command, args and env.`,
            'Do not paste secrets into prompts. Store credentials in the MCP config env block.',
          ],
        },
      ],
      footer: 'Some HTTP servers require OAuth after they are added.',
    }));
  }
}
