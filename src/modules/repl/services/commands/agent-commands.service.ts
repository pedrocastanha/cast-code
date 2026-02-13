import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { AgentRegistryService } from '../../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../../skills/services/skill-registry.service';

interface SmartInput {
  askChoice: (question: string, choices: { key: string; label: string; description: string }[]) => Promise<string>;
  question: (prompt: string) => Promise<string>;
}

@Injectable()
export class AgentCommandsService {
  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async cmdAgents(args: string[], smartInput: SmartInput): Promise<void> {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const agents = this.agentRegistry.resolveAllAgents();
      w('\r\n');
      w(colorize(Icons.robot + ' ', 'accent') + colorize(`Agents (${agents.length})`, 'bold') + '\r\n');
      w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n');

      if (agents.length === 0) {
        w(`  ${colorize('No agents loaded', 'muted')}\r\n`);
        w(`  ${colorize('Create one with /agents create', 'muted')}\r\n`);
      } else {
        const maxName = Math.max(...agents.map(a => a.name.length), 4);
        for (const a of agents) {
          const toolNames = (a.tools as any[]).map((t: any) => t.name).slice(0, 3);
          const toolsInfo = toolNames.length ? colorize(` [${toolNames.join(', ')}${(a.tools as any[]).length > 3 ? '...' : ''}]`, 'muted') : '';
          w(`  ${colorize(a.name.padEnd(maxName), 'cyan')}  ${colorize(a.description.slice(0, 40), 'muted')}${toolsInfo}\r\n`);
        }
      }
      w(`\r\n  ${colorize('/agents <name>', 'dim')} - details  ${colorize('/agents create', 'dim')} - new agent\r\n\r\n`);
      return;
    }

    if (sub === 'create') {
      await this.createAgentWizard(smartInput);
      return;
    }

    const agent = this.agentRegistry.resolveAgent(sub);
    if (agent) {
      const toolNames = (agent.tools as any[]).map((t: any) => t.name);
      w('\r\n');
      w(colorize(Icons.robot + ' ', 'accent') + colorize(`Agent: ${agent.name}`, 'bold') + '\r\n');
      w(colorize(Box.horizontal.repeat(25), 'subtle') + '\r\n');
      w(`  ${colorize('Description:', 'muted')} ${agent.description}\r\n`);
      w(`  ${colorize('Model:', 'muted')}       ${colorize(agent.model, 'cyan')}\r\n`);
      w(`  ${colorize('Tools:', 'muted')}       ${toolNames.length > 0 ? toolNames.join(', ') : colorize('none', 'muted')}\r\n`);
      w(`  ${colorize('MCP:', 'muted')}         ${agent.mcp.length > 0 ? agent.mcp.join(', ') : colorize('none', 'muted')}\r\n\r\n`);
    } else {
      w(`${Colors.red}  Agent "${sub}" not found${Colors.reset}\r\n`);
    }
  }

  async cmdSkills(args: string[], smartInput: SmartInput): Promise<void> {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const skills = this.skillRegistry.getAllSkills();
      w('\r\n');
      w(colorize(Icons.gear + ' ', 'accent') + colorize(`Skills (${skills.length})`, 'bold') + '\r\n');
      w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n');

      if (skills.length === 0) {
        w(`  ${colorize('No skills loaded', 'muted')}\r\n`);
        w(`  ${colorize('Create one with /skills create', 'muted')}\r\n`);
      } else {
        const maxName = Math.max(...skills.map(s => s.name.length), 4);
        for (const s of skills) {
          w(`  ${colorize(s.name.padEnd(maxName), 'cyan')}  ${colorize(s.description.slice(0, 40), 'muted')}  ${colorize('[' + s.tools.slice(0, 3).join(', ') + (s.tools.length > 3 ? '...' : '') + ']', 'muted')}\r\n`);
        }
      }
      w(`\r\n  ${colorize('/skills create', 'dim')} - create new skill\r\n\r\n`);
      return;
    }

    if (sub === 'create') {
      await this.createSkillWizard(smartInput);
      return;
    }

    w(`${Colors.red}  Unknown: /skills ${sub}${Colors.reset}\r\n`);
  }

  private async createAgentWizard(smartInput: SmartInput): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const castDir = path.join(process.cwd(), '.cast', 'definitions', 'agents');
    
    if (!fs.existsSync(castDir)) {
      fs.mkdirSync(castDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(colorize(Icons.robot + ' ', 'accent') + colorize('Create New Agent', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n\r\n');

    const name = await smartInput.question(colorize('  Name: ', 'cyan'));
    if (!name.trim()) {
      w(colorize('\r\n  Cancelled\r\n', 'muted'));
      return;
    }

    const description = await smartInput.question(colorize('  Description: ', 'cyan'));
    const skillsInput = await smartInput.question(colorize('  Skills (comma-separated): ', 'cyan'));
    const skills = skillsInput.trim()
      ? skillsInput.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    const content = [
      '---',
      `name: ${name.trim()}`,
      `description: "${description.trim()}"`,
      skills.length > 0 ? `skills: [${skills.map((s: string) => `"${s}"`).join(', ')}]` : 'skills: []',
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

    w(`\r\n${colorize('✓', 'success')} Agent created: ${colorize(filePath, 'accent')}\r\n`);
    w(colorize('  Edit the file to customize, then restart\r\n\r\n', 'muted'));
  }

  private async createSkillWizard(smartInput: SmartInput): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const castDir = path.join(process.cwd(), '.cast', 'definitions', 'skills');
    
    if (!fs.existsSync(castDir)) {
      fs.mkdirSync(castDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(colorize(Icons.gear + ' ', 'accent') + colorize('Create New Skill', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(20), 'subtle') + '\r\n\r\n');

    const name = await smartInput.question(colorize('  Name: ', 'cyan'));
    if (!name.trim()) {
      w(colorize('\r\n  Cancelled\r\n', 'muted'));
      return;
    }

    const description = await smartInput.question(colorize('  Description: ', 'cyan'));
    
    w(`\r\n  ${colorize('Available tools: read_file, write_file, edit_file, glob, grep, ls, shell', 'muted')}\r\n`);
    const toolsInput = await smartInput.question(colorize('  Tools (comma-separated): ', 'cyan'));
    const tools = toolsInput.trim()
      ? toolsInput.split(',').map((t: string) => t.trim()).filter(Boolean)
      : ['read_file', 'write_file', 'edit_file', 'glob', 'grep'];

    const content = [
      '---',
      `name: ${name.trim()}`,
      `description: "${description.trim()}"`,
      `tools: [${tools.map((t: string) => `"${t}"`).join(', ')}]`,
      '---',
      '',
      '# Guidelines',
      '',
      `When using this skill:`,
      '',
      `1. ${description.trim() || 'Be helpful and follow conventions'}`,
      '',
    ].join('\n');

    const filename = `${name.trim().toLowerCase().replace(/\s+/g, '-')}.md`;
    const filePath = path.join(castDir, filename);
    fs.writeFileSync(filePath, content);

    w(`\r\n${colorize('✓', 'success')} Skill created: ${colorize(filePath, 'accent')}\r\n`);
    w(colorize('  Edit the file to add guidelines, then restart\r\n\r\n', 'muted'));
  }
}
