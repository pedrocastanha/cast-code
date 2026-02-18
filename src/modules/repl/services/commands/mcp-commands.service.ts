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

interface SmartInput {
  askChoice: (question: string, choices: { key: string; label: string; description: string }[]) => Promise<string>;
  question: (prompt: string) => Promise<string>;
}

@Injectable()
export class McpCommandsService {
  constructor(
    private readonly mcpRegistry: McpRegistryService,
    private readonly mcpClient: McpClientService,
  ) {}

  async cmdMcp(args: string[], smartInput: SmartInput & { pause: () => void; resume: () => void }): Promise<void> {
    const sub = args[0] || 'menu';

    if (sub === 'menu') {
      try {
        await this.showMcpMenu(smartInput);
      } catch (error: any) {
        if (error instanceof CancelledPromptError || error?.name === 'CancelledPromptError') {
          console.log(colorize('\n❌ Cancelado. Voltando ao chat...\n', 'warning'));
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
        console.log(colorize('\n❌ Cancelado. Voltando ao chat...\n', 'warning'));
        return;
      }
      throw error;
    } finally {
      smartInput.resume();
    }
  }

  private async showMcpMenu(smartInput: SmartInput): Promise<void> {
    const w = (s: string) => process.stdout.write(s);

    while (true) {
      w(`\n${colorize('☁️  MCP Hub', 'bold')}\n`);
      w(`${colorize(Box.horizontal.repeat(30), 'subtle')}\n\n`);

      const summaries = this.mcpRegistry.getServerSummaries();
      const totalTools = summaries.reduce((sum, s) => sum + s.toolCount, 0);

      w(`${colorize('Servidores:', 'muted')} ${summaries.length}  `);
      w(`${colorize('Ferramentas:', 'muted')} ${totalTools}\n\n`);

      console.log(colorize('(pressione ESC para voltar ao chat)\n', 'muted'));

      const action = await this.withEsc(() => smartInput.askChoice('O que deseja fazer?', [
        { key: '1', label: 'Ver servidores', description: 'Listar MCPs configurados' },
        { key: '2', label: 'Ver ferramentas', description: 'Todas as tools disponíveis' },
        { key: '3', label: 'Conectar servidores', description: 'Conectar/reconectar MCPs configurados' },
        { key: '4', label: 'Adicionar servidor', description: 'Configurar novo MCP' },
        { key: '5', label: 'Remover servidor', description: 'Desconectar MCP' },
        { key: '6', label: 'O que é MCP?', description: 'Entenda o protocolo' },
        { key: 'q', label: 'Voltar', description: 'Sair do MCP Hub' },
      ]));

      if (action === null) {
        console.log(colorize('\nSaindo do MCP Hub...\n', 'muted'));
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

  private async connectServers(smartInput?: SmartInput & { pause: () => void; resume: () => void }): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const summaries = this.mcpRegistry.getServerSummaries();

    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('Conectar Servidores MCP', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(40), 'subtle') + '\r\n\n');

    if (summaries.length === 0) {
      w(`  ${colorize('Nenhum servidor configurado. Use a opção Adicionar servidor.', 'muted')}\r\n\n`);
      return;
    }

    w(`  ${colorize('Conectando ' + summaries.length + ' servidor(es)...', 'muted')}\r\n\n`);

    const results = await this.mcpRegistry.connectAll();

    for (const [name, ok] of results.entries()) {
      const icon = ok ? colorize('●', 'success') : colorize('○', 'error');
      const status = ok ? colorize('conectado', 'success') : colorize('falhou', 'error');
      w(`  ${icon} ${colorize(name, 'cyan')} — ${status}\r\n`);

      if (!ok) {
        const config = this.mcpRegistry.getConfig(name);

        if (config?.type === 'http') {
          w(`\r\n  ${colorize('⚠️  ' + name + ': OAuth bloqueado pelo servidor', 'warning')}\r\n`);
          w(`     Este servidor só aceita clientes pré-aprovados (ex: VS Code, Cursor).\r\n`);
          w(`     Alternativa: use o proxy mcp-remote para redirecionar via cliente aprovado.\r\n\r\n`);

        } else if (config?.type === 'stdio' && smartInput) {
          const template = getTemplate(name);
          if (template?.credentials?.length) {
            const missing = template.credentials.filter(cred => {
              if (cred.isArg) return false; 
              return !config.env?.[cred.envVar];
            });

            if (missing.length > 0) {
              w(`\r\n  ${colorize('🔑 Credenciais necessárias para ' + name, 'warning')}\r\n\r\n`);

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

              w(`\r\n  ${colorize('Reconectando ' + name + '...', 'muted')}\r\n`);
              const retryOk = await this.mcpRegistry.connectMcp(name);
              const retryIcon = retryOk ? colorize('●', 'success') : colorize('○', 'error');
              const retryStatus = retryOk ? colorize('conectado', 'success') : colorize('falhou — verifique a credencial', 'error');
              w(`  ${retryIcon} ${colorize(name, 'cyan')} — ${retryStatus}\r\n\r\n`);
            } else {
              w(`  ${colorize('Verifique se o servidor está disponível e tente novamente.', 'muted')}\r\n\r\n`);
            }
          }
        }
      }
    }

    const finalResults = await this.mcpRegistry.connectAll();
    const connected = [...finalResults.values()].filter(Boolean).length;
    w(`  ${colorize(`${connected}/${finalResults.size} conectado(s)`, connected === finalResults.size ? 'success' : 'warning')}\r\n\r\n`);
  }

  private async listServers(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const summaries = this.mcpRegistry.getServerSummaries();

    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('MCP Servers', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(40), 'subtle') + '\r\n\n');

    if (summaries.length === 0) {
      w(`  ${colorize('Nenhum servidor MCP configurado', 'muted')}\r\n\n`);
      w(`  ${colorize('O que é MCP?', 'cyan')} → /mcp what\r\n`);
      w(`  ${colorize('Como adicionar?', 'cyan')} → /mcp add\r\n\n`);
      return;
    }

    for (const s of summaries) {
      const statusIcon = s.status === 'connected' ? colorize('●', 'success') : colorize('○', 'error');
      const statusText = s.status === 'connected' ? colorize('conectado', 'success') : colorize(s.status, 'error');
      
      w(`  ${statusIcon} ${colorize(s.name, 'cyan')} ${colorize(`(${s.transport})`, 'muted')}\r\n`);
      w(`    Status: ${statusText} | Ferramentas: ${s.toolCount}\r\n`);
      
      if (s.toolCount > 0) {
        const toolNames = s.toolDescriptions.slice(0, 3).map(t => t.name.split('_').pop()).join(', ');
        const more = s.toolCount > 3 ? ` +${s.toolCount - 3} mais` : '';
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
      w(`\n  ${colorize('Nenhuma ferramenta disponível', 'muted')}\r\n\n`);
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

  private async addMcpWizard(smartInput: SmartInput): Promise<void> {
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');

    if (!fs.existsSync(mcpDir)) {
      fs.mkdirSync(mcpDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('Adicionar Servidor MCP', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    console.log(colorize('(pressione ESC para cancelar a qualquer momento)\r\n', 'muted'));

    const category = await selectWithEsc<McpCategory | 'custom'>({
      message: 'Escolha uma categoria:',
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
        { name: '➕ Configuração manual', value: 'custom' },
      ],
    });

    if (category === null) {
      w(colorize('\r\n  ❌ Cancelado.\r\n\r\n', 'warning'));
      return;
    }

    let config: Record<string, any> = {};
    let name: string;

    if (category !== 'custom') {
      const templates = getTemplatesByCategory(category);
      const templateId = await selectWithEsc<string>({
        message: 'Escolha um servidor:',
        choices: templates.map(t => ({
          name: `${t.name} - ${t.description}`,
          value: t.id,
        })),
      });

      if (templateId === null) {
        w(colorize('\r\n  ❌ Cancelado.\r\n\r\n', 'warning'));
        return;
      }

      const template = getTemplate(templateId);
      if (!template) {
        w(colorize('\r\n  ❌ Template não encontrado.\r\n\r\n', 'error'));
        return;
      }

      name = template.id;
      config = JSON.parse(JSON.stringify(template.config)); // Deep clone

      if (template.credentials.length > 0) {
        w(`\r\n${colorize('📝 Configuração:', 'bold')}\r\n`);

        for (const cred of template.credentials) {
          if (cred.isArg) {
            const value = await smartInput.question(colorize(`  ${cred.name} (${cred.placeholder}): `, 'cyan'));
            if (!value.trim() && cred.required) {
              w(colorize('\r\n  ❌ Campo obrigatório!\r\n\r\n', 'error'));
              return;
            }
            if (value.trim()) {
              config.args.push(value.trim());
            }
          } else {
            const value = await smartInput.question(colorize(`  ${cred.name} (${cred.placeholder}): `, 'cyan'));
            if (!value.trim() && cred.required) {
              w(colorize('\r\n  ❌ Campo obrigatório!\r\n\r\n', 'error'));
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
      w(`\r\n${colorize('✓', 'success')} MCP configurado: ${colorize(filePath, 'accent')}\r\n`);

      if (name === 'figma') {
        w('\r\n');
        w(colorize('  ─────────────────────────────────────────\r\n', 'subtle'));
        w(colorize('   Tutorial — Figma Desktop MCP\r\n', 'bold'));
        w(colorize('  ─────────────────────────────────────────\r\n', 'subtle'));
        w('\r\n');
        w(colorize('  Passo 1: ', 'accent') + 'Instale o Figma Desktop\r\n');
        w(colorize('           https://www.figma.com/downloads/\r\n', 'muted'));
        w('\r\n');
        w(colorize('  Passo 2: ', 'accent') + 'Abra qualquer arquivo de Design no Figma\r\n');
        w('\r\n');
        w(colorize('  Passo 3: ', 'accent') + 'Ative o Dev Mode\r\n');
        w(colorize('           Clique no botão "<>" no canto superior direito\r\n', 'muted'));
        w('\r\n');
        w(colorize('  Passo 4: ', 'accent') + 'Habilite o servidor MCP\r\n');
        w(colorize('           Painel Inspect → seção MCP\r\n', 'muted'));
        w(colorize('           Ative "Enable desktop MCP server"\r\n', 'muted'));
        w('\r\n');
        w(colorize('  Passo 5: ', 'accent') + 'Conecte via Cast\r\n');
        w(colorize('           Reinicie o Cast e use /mcp → Conectar servidores\r\n', 'muted'));
        w('\r\n');
        w(colorize('  ─────────────────────────────────────────\r\n', 'subtle'));
        w('\r\n');
      } else if (template.config.type === 'http') {
        w(colorize('\r\n  ⚠️  Servidor HTTP/OAuth detectado!\r\n', 'warning'));
        w(colorize('     Autenticação pode ser necessária após conectar.\r\n\r\n', 'muted'));
      }

      w(colorize('  Reinicie o Cast para conectar\r\n\r\n', 'muted'));
      return;
    }

    const nameInput = await inputWithEsc({
      message: colorize('  Nome do servidor: ', 'cyan'),
    });
    if (nameInput === null || !nameInput.trim()) {
      w(colorize('\r\n  ❌ Cancelado\r\n', 'muted'));
      return;
    }
    name = nameInput;

    const typeChoice = await smartInput.askChoice('  Tipo de transporte:', [
      { key: 'stdio', label: 'stdio', description: 'Processo local (npx, node, python)' },
      { key: 'http', label: 'http', description: 'Endpoint HTTP' },
    ]);

    config.type = typeChoice;

    if (typeChoice === 'stdio') {
      const command = await inputWithEsc({
        message: colorize('  Comando: ', 'cyan'),
      });
      if (command === null) {
        w(colorize('\r\n  ❌ Cancelado\r\n', 'muted'));
        return;
      }
      
      const argsInput = await inputWithEsc({
        message: colorize('  Argumentos (separados por vírgula): ', 'cyan'),
      });
      if (argsInput === null) {
        w(colorize('\r\n  ❌ Cancelado\r\n', 'muted'));
        return;
      }
      
      config.command = command.trim();
      config.args = argsInput.trim() ? argsInput.split(',').map((a: string) => a.trim()) : [];
      
      const hasEnv = await confirmWithEsc({ message: 'Precisa de variáveis de ambiente?', default: false });
      if (hasEnv === null) {
        w(colorize('\r\n  ❌ Cancelado\r\n', 'muted'));
        return;
      }
      if (hasEnv) {
        config.env = {};
        while (true) {
          const key = await inputWithEsc({
            message: colorize('  Nome da variável (ou vazio para parar): ', 'cyan'),
          });
          if (key === null) {
            w(colorize('\r\n  ❌ Cancelado\r\n', 'muted'));
            return;
          }
          if (!key) break;
          
          const value = await inputWithEsc({
            message: colorize(`  Valor para ${key}: `, 'cyan'),
          });
          if (value === null) {
            w(colorize('\r\n  ❌ Cancelado\r\n', 'muted'));
            return;
          }
          config.env[key] = value;
        }
      }
    } else {
      const endpoint = await inputWithEsc({
        message: colorize('  URL do endpoint: ', 'cyan'),
      });
      if (endpoint === null) {
        w(colorize('\r\n  ❌ Cancelado\r\n', 'muted'));
        return;
      }
      config.endpoint = endpoint.trim();
    }

    const filePath = path.join(mcpDir, `${name.trim().toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ [name.trim()]: config }, null, 2));

    w(`\r\n${colorize('✓', 'success')} Config salva: ${colorize(filePath, 'accent')}\r\n`);
    w(colorize('  Reinicie o Cast para conectar\r\n\r\n', 'muted'));
  }

  private async removeMcpWizard(smartInput: SmartInput): Promise<void> {
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');

    if (!fs.existsSync(mcpDir)) {
      console.log(colorize('\nNenhum MCP configurado\n', 'muted'));
      return;
    }

    const files = fs.readdirSync(mcpDir).filter((f: string) => f.endsWith('.json'));
    if (files.length === 0) {
      console.log(colorize('\nNenhum MCP configurado\n', 'muted'));
      return;
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('Remover Servidor MCP', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(25), 'subtle') + '\r\n\n');

    const toRemove = await select<string>({
      message: 'Qual servidor remover?',
      choices: files.map((f: string) => ({ 
        name: f.replace('.json', ''), 
        value: f 
      })),
    });

    const confirmRemove = await confirm({
      message: `Tem certeza que deseja remover "${toRemove.replace('.json', '')}"?`,
      default: false,
    });

    if (confirmRemove) {
      fs.unlinkSync(path.join(mcpDir, toRemove));
      console.log(colorize(`\n✓ Servidor removido\n`, 'success'));
    }
  }

  private async testMcpTool(smartInput: SmartInput): Promise<void> {
    console.log(colorize('\nEm breve!\n', 'muted'));
  }

  private printWhatIsMcp(): void {
    const w = (s: string) => process.stdout.write(s);

    w(`\n${colorize('☁️  O que é MCP?', 'bold')}\n`);
    w(`${colorize(Box.horizontal.repeat(50), 'subtle')}\n\n`);

    w(`${colorize('Model Context Protocol (MCP)', 'cyan')} é um protocolo aberto\n`);
    w(`que permite que assistentes de IA se conectem a fontes de dados\n`);
    w(`e ferramentas externas de forma padronizada.\n\n`);

    w(`${colorize('Como funciona:', 'bold')}\n`);
    w(`  ${colorize('1.', 'primary')} Um servidor MCP expõe ferramentas (tools)\n`);
    w(`  ${colorize('2.', 'primary')} O Cast se conecta a esse servidor\n`);
    w(`  ${colorize('3.', 'primary')} A IA pode chamar essas ferramentas automaticamente\n\n`);

    w(`${colorize('Exemplos de uso:', 'bold')}\n`);
    w(`  ${colorize('•', 'muted')} GitHub: criar issues, ler PRs, fazer commits\n`);
    w(`  ${colorize('•', 'muted')} Filesystem: acessar arquivos fora do projeto\n`);
    w(`  ${colorize('•', 'muted')} PostgreSQL: consultar bancos de dados\n`);
    w(`  ${colorize('•', 'muted')} Brave: buscar informações atualizadas na web\n\n`);

    w(`${colorize('Vantagens:', 'bold')}\n`);
    w(`  ${colorize('✓', 'success')} Segurança: o usuário controla o acesso\n`);
    w(`  ${colorize('✓', 'success')} Flexibilidade: qualquer linguagem/framework\n`);
    w(`  ${colorize('✓', 'success')} Padrão aberto: não é vendor lock-in\n\n`);

    w(`${colorize('Quer criar seu próprio MCP?', 'accent')}\n`);
    w(`  → /mcp help (guia completo)\n`);
    w(`  → https://modelcontextprotocol.io\n\n`);
  }

  private printHowToCreate(): void {
    const w = (s: string) => process.stdout.write(s);

    w(`\n${colorize('🛠️  Como Criar um Servidor MCP', 'bold')}\n`);
    w(`${colorize(Box.horizontal.repeat(50), 'subtle')}\n\n`);

    w(`${colorize('Opção 1: TypeScript/JavaScript (mais fácil)', 'bold')}\n\n`);
    w(`${colorize('1.', 'primary')} Crie um projeto:\n`);
    w(`   ${colorize('mkdir meu-mcp && cd meu-mcp', 'muted')}\n`);
    w(`   ${colorize('npm init -y', 'muted')}\n`);
    w(`   ${colorize('npm install @modelcontextprotocol/sdk zod', 'muted')}\n\n`);

    w(`${colorize('2.', 'primary')} Crie o servidor (index.ts):\n`);
    w(colorize(`   import { Server } from '@modelcontextprotocol/sdk/server/index.js';\n`, 'muted'));
    w(colorize(`   import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';\n`, 'muted'));
    w(colorize(`\n`, 'muted'));
    w(colorize(`   const server = new Server(\n`, 'muted'));
    w(colorize(`     { name: 'meu-mcp', version: '1.0.0' },\n`, 'muted'));
    w(colorize(`     { capabilities: { tools: {} } }\n`, 'muted'));
    w(colorize(`   );\n`, 'muted'));
    w(colorize(`\n`, 'muted'));
    w(colorize(`   server.setRequestHandler(ListToolsRequestSchema, async () => ({\n`, 'muted'));
    w(colorize(`     tools: [{\n`, 'muted'));
    w(colorize(`       name: 'minha_tool',\n`, 'muted'));
    w(colorize(`       description: 'Faz algo útil',\n`, 'muted'));
    w(colorize(`       inputSchema: {\n`, 'muted'));
    w(colorize(`         type: 'object',\n`, 'muted'));
    w(colorize(`         properties: { nome: { type: 'string' } },\n`, 'muted'));
    w(colorize(`         required: ['nome']\n`, 'muted'));
    w(colorize(`       }\n`, 'muted'));
    w(colorize(`     }]\n`, 'muted'));
    w(colorize(`   }));\n`, 'muted'));
    w(colorize(`\n`, 'muted'));
    w(colorize(`   server.setRequestHandler(CallToolRequestSchema, async (req) => {\n`, 'muted'));
    w(colorize(`     const args = req.params.arguments;\n`, 'muted'));
    w(colorize(`     return { content: [{ type: 'text', text: 'Resultado!' }] };\n`, 'muted'));
    w(colorize(`   });\n`, 'muted'));
    w(colorize(`\n`, 'muted'));
    w(colorize(`   const transport = new StdioServerTransport();\n`, 'muted'));
    w(colorize(`   await server.connect(transport);\n`, 'muted'));
    w(`\n`);

    w(`${colorize('Opção 2: Python', 'bold')}\n\n`);
    w(`   ${colorize('pip install mcp', 'muted')}\n\n`);
    w(`   Veja: ${colorize('https://github.com/modelcontextprotocol/python-sdk', 'accent')}\n\n`);

    w(`${colorize('3.', 'primary')} Publique no npm (opcional):\n`);
    w(`   Outros poderão usar: ${colorize('npx -y seu-mcp-server', 'muted')}\n\n`);

    w(`${colorize('Recursos:', 'bold')}\n`);
    w(`  ${colorize('•', 'muted')} Documentação: https://modelcontextprotocol.io\n`);
    w(`  ${colorize('•', 'muted')} SDK TypeScript: @modelcontextprotocol/sdk\n`);
    w(`  ${colorize('•', 'muted')} Exemplos: github.com/modelcontextprotocol/servers\n\n`);
  }

  private printMcpHelp(): void {
    const w = (s: string) => process.stdout.write(s);

    w(`\n${colorize('☁️  MCP - Guia Rápido', 'bold')}\n`);
    w(`${colorize(Box.horizontal.repeat(40), 'subtle')}\n\n`);

    w(`${colorize('Comandos:', 'bold')}\n`);
    w(`  ${colorize('/mcp', 'cyan')}          → Menu interativo\n`);
    w(`  ${colorize('/mcp list', 'cyan')}     → Ver servidores\n`);
    w(`  ${colorize('/mcp tools', 'cyan')}    → Ver ferramentas\n`);
    w(`  ${colorize('/mcp add', 'cyan')}      → Adicionar servidor\n`);
    w(`  ${colorize('/mcp remove', 'cyan')}   → Remover servidor\n`);
    w(`  ${colorize('/mcp what', 'cyan')}     → O que é MCP?\n\n`);

    w(`${colorize('Servidores populares:', 'bold')}\n`);
    w(`  ${colorize('@modelcontextprotocol/server-github', 'muted')}\n`);
    w(`    Acesse repositórios, issues, PRs\n\n`);
    w(`  ${colorize('@figma/mcp-server (HTTP)', 'muted')}\n`);
    w(`    Acesse designs e componentes (requer OAuth)\n\n`);
    w(`  ${colorize('@modelcontextprotocol/server-filesystem', 'muted')}\n`);
    w(`    Leia/escrita de arquivos locais\n\n`);
    w(`  ${colorize('@modelcontextprotocol/server-postgres', 'muted')}\n`);
    w(`    Consulte bancos PostgreSQL\n\n`);
    w(`  ${colorize('@modelcontextprotocol/server-brave-search', 'muted')}\n`);
    w(`    Busca na web via Brave\n\n`);

    w(`${colorize('Servidores HTTP (OAuth):', 'bold')}\n`);
    w(`  Alguns servidores como Figma usam HTTP + OAuth.\n`);
    w(`  Após adicionar, a autenticação será solicitada.\n\n`);

    w(`${colorize('Configuração manual:', 'bold')}\n`);
    w(`  Crie: ${colorize('.cast/mcp/nome.json', 'cyan')}\n\n`);
    w(colorize(`  {\n`, 'muted'));
    w(colorize(`    "meu-mcp": {\n`, 'muted'));
    w(colorize(`      "type": "stdio",\n`, 'muted'));
    w(colorize(`      "command": "npx",\n`, 'muted'));
    w(colorize(`      "args": ["-y", "@modelcontextprotocol/server-github"],\n`, 'muted'));
    w(colorize(`      "env": { "GITHUB_TOKEN": "..." }\n`, 'muted'));
    w(colorize(`    }\n`, 'muted'));
    w(colorize(`  }\n`, 'muted'));
    w(`\n`);
  }
}
