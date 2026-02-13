import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { McpRegistryService } from '../../../mcp/services/mcp-registry.service';
import { McpClientService } from '../../../mcp/services/mcp-client.service';
import {
  selectWithEsc,
  inputWithEsc,
  confirmWithEsc,
  CancelledPromptError,
} from '../../utils/prompts-with-esc';

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
    const w = (s: string) => process.stdout.write(s);
    
    smartInput.pause();

    try {
      switch (sub) {
      case 'menu':
        await this.showMcpMenu(smartInput);
        break;

      case 'list': {
        await this.listServers();
        break;
      }

      case 'tools': {
        await this.listTools();
        break;
      }

      case 'add': {
        await this.addMcpWizard(smartInput);
        break;
      }

      case 'remove': {
        await this.removeMcpWizard(smartInput);
        break;
      }

      case 'test': {
        await this.testMcpTool(smartInput);
        break;
      }

      case 'what':
      case 'about':
        this.printWhatIsMcp();
        break;

      case 'help':
      default:
        this.printMcpHelp();
        break;
    }
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
        { key: '3', label: 'Adicionar servidor', description: 'Configurar novo MCP' },
        { key: '4', label: 'Remover servidor', description: 'Desconectar MCP' },
        { key: '5', label: 'O que é MCP?', description: 'Entenda o protocolo' },
        { key: '6', label: 'Como criar um MCP', description: 'Guia de desenvolvimento' },
        { key: 'q', label: 'Voltar', description: 'Sair do MCP Hub' },
      ]));

      if (action === null) {
        console.log(colorize('\nSaindo do MCP Hub...\n', 'muted'));
        return;
      }

      switch (action) {
        case '1':
          await this.listServers();
          break;
        case '2':
          await this.listTools();
          break;
        case '3':
          await this.addMcpWizard(smartInput);
          break;
        case '4':
          await this.removeMcpWizard(smartInput);
          break;
        case '5':
          this.printWhatIsMcp();
          break;
        case '6':
          this.printHowToCreate();
          break;
        case 'q':
          return;
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
    const fs = require('fs');
    const path = require('path');
    const mcpDir = path.join(process.cwd(), '.cast', 'mcp');

    if (!fs.existsSync(mcpDir)) {
      fs.mkdirSync(mcpDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('Adicionar Servidor MCP', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    console.log(colorize('(pressione ESC para cancelar a qualquer momento)\r\n', 'muted'));

    // Show popular options first
    const useTemplate = await confirmWithEsc({
      message: 'Usar um servidor MCP popular (GitHub, Filesystem, etc)?',
      default: true,
    });

    if (useTemplate === null) {
      w(colorize('\r\n  ❌ Cancelado.\r\n\r\n', 'warning'));
      return;
    }

    let config: Record<string, any> = {};
    let name: string;

    if (useTemplate) {
      const template = await selectWithEsc<string>({
        message: 'Escolha um servidor:',
        choices: [
          { name: 'GitHub - Acesse issues, repos, PRs', value: 'github' },
          { name: 'Figma - Acesse designs e componentes', value: 'figma' },
          { name: 'Filesystem - Acesse arquivos locais', value: 'filesystem' },
          { name: 'PostgreSQL - Consulte bancos de dados', value: 'postgres' },
          { name: 'Brave Search - Busca na web', value: 'brave' },
          { name: 'Puppeteer - Automação de browser', value: 'puppeteer' },
          { name: '➕ Configuração manual', value: 'custom' },
        ],
      });

      if (template === null) {
        w(colorize('\r\n  ❌ Cancelado.\r\n\r\n', 'warning'));
        return;
      }

      if (template === 'github') {
        name = 'github';
        const token = await smartInput.question(colorize('  GitHub Token (ghp_...): ', 'cyan'));
        config = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
        };
      } else if (template === 'figma') {
        name = 'figma';
        w('\r\n');
        w(colorize('  🎨 Figma MCP (Servidor Remoto)\r\n', 'cyan'));
        w(colorize('  ─────────────────────────────\r\n\r\n', 'subtle'));
        w(colorize('  Este é um servidor remoto oficial do Figma.\r\n', 'muted'));
        w(colorize('  Após adicionar, use /mcp para autenticar.\r\n\r\n', 'muted'));
        config = {
          type: 'http',
          endpoint: 'https://mcp.figma.com/mcp',
        };
      } else if (template === 'filesystem') {
        name = 'filesystem';
        const dir = await smartInput.question(colorize('  Diretório acessível: ', 'cyan'));
        config = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', dir || process.cwd()],
        };
      } else if (template === 'postgres') {
        name = 'postgres';
        const dbUrl = await smartInput.question(colorize('  Database URL: ', 'cyan'));
        config = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres', dbUrl],
        };
      } else if (template === 'brave') {
        name = 'brave';
        const apiKey = await smartInput.question(colorize('  Brave API Key: ', 'cyan'));
        config = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-brave-search'],
          env: { BRAVE_API_KEY: apiKey },
        };
      } else if (template === 'puppeteer') {
        name = 'puppeteer';
        config = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-puppeteer'],
        };
      } else {
        // Custom - fall through to manual
        name = '';
      }

      if (name) {
        const filePath = path.join(mcpDir, `${name}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ [name]: config }, null, 2));
        w(`\r\n${colorize('✓', 'success')} MCP configurado: ${colorize(filePath, 'accent')}\r\n`);
        
        if (name === 'figma') {
          w(colorize('\r\n  ⚠️  Atenção: Autenticação OAuth necessária!\r\n', 'warning'));
          w(colorize('     O Figma requer autenticação OAuth.\r\n', 'muted'));
          w(colorize('     Após reiniciar, o servidor solicitará login.\r\n\r\n', 'muted'));
        }
        
        w(colorize('  Reinicie o Cast para conectar\r\n\r\n', 'muted'));
        return;
      }
    }

    // Manual configuration
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
    const fs = require('fs');
    const path = require('path');
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
    // Implementation for testing MCP tools could go here
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
