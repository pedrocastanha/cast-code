import { Injectable } from '@nestjs/common';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { AgentRegistryService } from '../../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../../skills/services/skill-registry.service';
import { ISmartInput } from '../smart-input';

@Injectable()
export class AgentCommandsService {
  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async cmdAgents(args: string[], smartInput: ISmartInput): Promise<void> {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const agents = this.agentRegistry.resolveAllAgents();
      w('\r\n');
      w(`  ${colorize('Agents', 'bold')} ${colorize(`(${agents.length})`, 'muted')}\r\n`);
      w(`  ${colorize(Box.horizontal.repeat(40), 'subtle')}\r\n`);

      if (agents.length === 0) {
        w('\r\n');
        w(`  ${colorize('No agents loaded.', 'muted')}\r\n`);
        w(`  ${colorize('Run ', 'muted')}${colorize('/agents create', 'cyan')}${colorize(' to create one.', 'muted')}\r\n`);
      } else {
        w('\r\n');
        const maxName = Math.max(...agents.map(a => a.name.length), 4);
        for (const a of agents) {
          const toolNames = (a.tools as any[]).map((t: any) => t.name).slice(0, 3);
          const toolsStr = toolNames.length
            ? colorize(` [${toolNames.join(', ')}${(a.tools as any[]).length > 3 ? '...' : ''}]`, 'subtle')
            : '';
          const desc = a.description.length > 45
            ? a.description.slice(0, 42) + '...'
            : a.description;
          w(`  ${colorize(Icons.bullet, 'primary')} ${colorize(a.name.padEnd(maxName), 'cyan')}  ${colorize(desc, 'muted')}${toolsStr}\r\n`);
        }
      }

      w('\r\n');
      w(`  ${colorize('/agents <name>', 'dim')}  view details    ${colorize('/agents create', 'dim')}  new agent\r\n`);
      w('\r\n');
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
      w(`  ${colorize('Agent', 'muted')} ${colorize(agent.name, 'bold')}\r\n`);
      w(`  ${colorize(Box.horizontal.repeat(40), 'subtle')}\r\n`);
      w('\r\n');
      w(`  ${colorize('Description', 'muted')}  ${agent.description}\r\n`);
      w(`  ${colorize('Model', 'muted')}        ${colorize(agent.model, 'cyan')}\r\n`);
      w(`  ${colorize('Tools', 'muted')}        ${toolNames.length > 0 ? colorize(toolNames.join(', '), 'cyan') : colorize('none', 'subtle')}\r\n`);
      w(`  ${colorize('MCP', 'muted')}          ${agent.mcp.length > 0 ? colorize(agent.mcp.join(', '), 'cyan') : colorize('none', 'subtle')}\r\n`);
      w('\r\n');
    } else {
      w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize(`Agent "${sub}" not found`, 'error')}\r\n`);
      w(`  ${colorize('Run ', 'muted')}${colorize('/agents', 'cyan')}${colorize(' to see available agents.', 'muted')}\r\n\r\n`);
    }
  }

  async cmdSkills(args: string[], smartInput: ISmartInput): Promise<void> {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const skills = this.skillRegistry.getAllSkills();
      w('\r\n');
      w(`  ${colorize('Skills', 'bold')} ${colorize(`(${skills.length})`, 'muted')}\r\n`);
      w(`  ${colorize(Box.horizontal.repeat(40), 'subtle')}\r\n`);

      if (skills.length === 0) {
        w('\r\n');
        w(`  ${colorize('No skills loaded.', 'muted')}\r\n`);
        w(`  ${colorize('Run ', 'muted')}${colorize('/skills create', 'cyan')}${colorize(' to create one.', 'muted')}\r\n`);
      } else {
        w('\r\n');
        const maxName = Math.max(...skills.map(s => s.name.length), 4);
        for (const s of skills) {
          const toolsPreview = s.tools.slice(0, 3).join(', ') + (s.tools.length > 3 ? '...' : '');
          const desc = s.description.length > 40
            ? s.description.slice(0, 37) + '...'
            : s.description;
          w(`  ${colorize(Icons.bullet, 'accent')} ${colorize(s.name.padEnd(maxName), 'cyan')}  ${colorize(desc, 'muted')}  ${colorize(`[${toolsPreview}]`, 'subtle')}\r\n`);
        }
      }

      w('\r\n');
      w(`  ${colorize('/skills create', 'dim')}  create new skill\r\n`);
      w('\r\n');
      return;
    }

    if (sub === 'create') {
      await this.createSkillWizard(smartInput);
      return;
    }

    w(`\r\n  ${colorize(Icons.cross, 'error')} ${colorize(`Unknown subcommand: /skills ${sub}`, 'error')}\r\n`);
    w(`  ${colorize('Try ', 'muted')}${colorize('/skills', 'cyan')}${colorize(' or ', 'muted')}${colorize('/skills create', 'cyan')}\r\n\r\n`);
  }

  private async createAgentWizard(smartInput: ISmartInput): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const castDir = path.join(process.cwd(), '.cast', 'agents');

    if (!fs.existsSync(castDir)) {
      fs.mkdirSync(castDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(`  ${colorize('Create Agent', 'bold')}\r\n`);
    w(`  ${colorize(Box.horizontal.repeat(30), 'subtle')}\r\n`);
    w('\r\n');

    const name = await smartInput.question(colorize('  Name: ', 'cyan'));
    if (!name.trim()) {
      w(colorize('\r\n  Cancelled.\r\n\r\n', 'muted'));
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

    w('\r\n');
    w(`  ${colorize(Icons.check, 'success')} Agent created: ${colorize(filePath, 'accent')}\r\n`);
    w(`  ${colorize('Edit the file to customize the system prompt, then restart.', 'muted')}\r\n\r\n`);
  }

  private async createSkillWizard(smartInput: ISmartInput): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const castDir = path.join(process.cwd(), '.cast', 'skills');

    if (!fs.existsSync(castDir)) {
      fs.mkdirSync(castDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w('\r\n');
    w(`  ${colorize('Create Skill', 'bold')}\r\n`);
    w(`  ${colorize(Box.horizontal.repeat(30), 'subtle')}\r\n`);
    w('\r\n');

    const name = await smartInput.question(colorize('  Name: ', 'cyan'));
    if (!name.trim()) {
      w(colorize('\r\n  Cancelled.\r\n\r\n', 'muted'));
      return;
    }

    const description = await smartInput.question(colorize('  Description: ', 'cyan'));

    w(`\r\n  ${colorize('Available tools:', 'muted')} read_file, write_file, edit_file, glob, grep, ls, shell\r\n\r\n`);
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

    w('\r\n');
    w(`  ${colorize(Icons.check, 'success')} Skill created: ${colorize(filePath, 'accent')}\r\n`);
    w(`  ${colorize('Edit the file to add guidelines, then restart.', 'muted')}\r\n\r\n`);
  }
}
