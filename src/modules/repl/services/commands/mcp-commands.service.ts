import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { McpRegistryService } from '../../../mcp/services/mcp-registry.service';

interface SmartInput {
  askChoice: (question: string, choices: { key: string; label: string; description: string }[]) => Promise<string>;
  question: (prompt: string) => Promise<string>;
}

@Injectable()
export class McpCommandsService {
  constructor(
    private readonly mcpRegistry: McpRegistryService,
  ) {}

  async cmdMcp(args: string[], smartInput: SmartInput): Promise<void> {
    const sub = args[0] || 'list';
    const w = (s: string) => process.stdout.write(s);

    switch (sub) {
      case 'list': {
        const summaries = this.mcpRegistry.getServerSummaries();
        w('\r\n');
        w(colorize(Icons.cloud + ' ', 'accent') + colorize('MCP Servers', 'bold') + '\r\n');
        w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n');
        
        if (summaries.length === 0) {
          w(`  ${colorize('No MCP servers configured', 'muted')}\r\n`);
          w(`  ${colorize('Use /mcp add to connect one', 'muted')}\r\n`);
        } else {
          for (const s of summaries) {
            const status = s.status === 'connected'
              ? colorize('● connected', 'success')
              : colorize('○ ' + s.status, 'error');
            w(`  ${colorize(s.name, 'cyan')}: ${status} (${s.toolCount} tools)\r\n`);
          }
        }
        w('\r\n');
        break;
      }

      case 'tools': {
        const summaries = this.mcpRegistry.getServerSummaries();
        const totalTools = summaries.reduce((sum, s) => sum + s.toolCount, 0);
        
        if (totalTools === 0) {
          w(`  ${colorize('No MCP tools available', 'muted')}\r\n`);
        } else {
          w('\r\n');
          w(colorize(Icons.tool + ' ', 'accent') + colorize(`MCP Tools (${totalTools})`, 'bold') + '\r\n');
          w(colorize(Box.horizontal.repeat(25), 'subtle') + '\r\n');
          
          for (const server of summaries) {
            if (server.toolCount === 0) continue;
            w(`\r\n  ${colorize(server.name, 'bold')} ${colorize(`(${server.transport})`, 'muted')}\r\n`);
            for (const td of server.toolDescriptions) {
              w(`    ${colorize('•', 'primary')} ${colorize(td.name, 'cyan')}\r\n`);
              w(`      ${colorize(td.description.slice(0, 60), 'muted')}${td.description.length > 60 ? '...' : ''}\r\n`);
            }
          }
          w('\r\n');
        }
        break;
      }

      case 'add': {
        await this.addMcpWizard(smartInput);
        break;
      }

      case 'help': {
        this.printMcpHelp();
        break;
      }

      default:
        w(`  ${colorize('Usage: /mcp list | /mcp tools | /mcp add | /mcp help', 'muted')}\r\n\r\n`);
    }
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
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('Add MCP Server', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n\r\n');

    const name = await smartInput.question(colorize('  Server name: ', 'cyan'));
    if (!name.trim()) {
      w(colorize('\r\n  Cancelled\r\n', 'muted'));
      return;
    }

    const typeChoice = await smartInput.askChoice('  Transport type:', [
      { key: 'stdio', label: 'stdio', description: 'Local process (npx, node, etc.)' },
      { key: 'http', label: 'http', description: 'HTTP endpoint' },
      { key: 'sse', label: 'sse', description: 'Server-Sent Events' },
    ]);

    const config: Record<string, any> = { type: typeChoice };

    if (typeChoice === 'stdio') {
      const command = await smartInput.question(colorize('  Command: ', 'cyan'));
      const argsInput = await smartInput.question(colorize('  Arguments (comma-separated): ', 'cyan'));
      config.command = command.trim();
      config.args = argsInput.trim() ? argsInput.split(',').map((a: string) => a.trim()) : [];
    } else {
      const endpoint = await smartInput.question(colorize('  Endpoint URL: ', 'cyan'));
      config.endpoint = endpoint.trim();
    }

    const filePath = path.join(mcpDir, `${name.trim().toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ [name.trim()]: config }, null, 2));

    w(`\r\n${colorize('✓', 'success')} MCP config saved: ${colorize(filePath, 'accent')}\r\n`);
    w(colorize('  Restart to connect the server\r\n\r\n', 'muted'));
  }

  private printMcpHelp(): void {
    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(colorize(Icons.cloud + ' ', 'accent') + colorize('MCP Setup Guide', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n\r\n');

    w(colorize('Step 1: Initialize project', 'bold') + '\r\n');
    w(`  ${colorize('/init', 'cyan')}  ${colorize('Creates .cast/ directory', 'muted')}\r\n\r\n`);

    w(colorize('Step 2: Add MCP server', 'bold') + '\r\n\r\n');
    w(`  ${colorize('Via wizard:', 'bold')}\r\n`);
    w(`    ${colorize('/mcp add', 'cyan')}  ${colorize('Interactive setup', 'muted')}\r\n\r\n`);

    w(`  ${colorize('Via JSON (stdio):', 'bold')} ${colorize('.cast/mcp/github.json', 'muted')}\r\n`);
    w(`    ${colorize('{', 'dim')}\r\n`);
    w(`    ${colorize('  "type": "stdio",', 'dim')}\r\n`);
    w(`    ${colorize('  "command": "npx",', 'dim')}\r\n`);
    w(`    ${colorize('  "args": ["-y", "@modelcontextprotocol/server-github"]', 'dim')}\r\n`);
    w(`    ${colorize('}', 'dim')}\r\n\r\n`);

    w(colorize('Step 3: Verify', 'bold') + '\r\n');
    w(`  ${colorize('/mcp list', 'cyan')}   ${colorize('See servers', 'muted')}\r\n`);
    w(`  ${colorize('/mcp tools', 'cyan')}  ${colorize('See tools', 'muted')}\r\n\r\n`);

    w(colorize('Popular MCP Servers', 'bold') + '\r\n');
    w(`  ${colorize('@modelcontextprotocol/server-github', 'dim')}  GitHub API\r\n`);
    w(`  ${colorize('@modelcontextprotocol/server-filesystem', 'dim')}  Local files\r\n`);
    w(`  ${colorize('@anthropics/claude-code-mcp', 'dim')}  Claude Code\r\n\r\n`);
  }
}
