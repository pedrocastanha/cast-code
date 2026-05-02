import { Injectable } from '@nestjs/common';
import { colorize, Icons } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';
import { AgentRegistryService } from '../../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../../skills/services/skill-registry.service';
import { ISmartInput } from '../smart-input';

@Injectable()
export class AgentCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async cmdAgents(args: string[], smartInput: ISmartInput): Promise<void> {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const agents = this.agentRegistry.resolveAllAgents();
      w(this.ui.panel({
        title: 'Agents',
        subtitle: `${agents.length} loaded`,
        sections: [
          {
            lines: agents.length === 0
              ? [colorize('No agents loaded. Run /agents create to create one.', 'muted')]
              : agents.map((a) => {
                const toolNames = (a.tools as any[]).map((t: any) => t.name).slice(0, 3);
                const toolsStr = toolNames.length
                  ? ` ${colorize(`[${toolNames.join(', ')}${(a.tools as any[]).length > 3 ? '...' : ''}]`, 'subtle')}`
                  : '';
                return `${colorize(Icons.bullet, 'primary')} ${colorize(a.name, 'cyan')}  ${colorize(a.description, 'muted')}${toolsStr}`;
              }),
          },
        ],
        footer: '/agents <name> shows details. /agents create starts the agent wizard.',
      }));
      return;
    }

    if (sub === 'create') {
      await this.createAgentWizard(smartInput);
      return;
    }

    const agent = this.agentRegistry.resolveAgent(sub);
    if (agent) {
      const toolNames = (agent.tools as any[]).map((t: any) => t.name);
      w(this.ui.panel({
        title: 'Agent',
        subtitle: agent.name,
        sections: [
          {
            rows: [
              { label: 'Description', value: agent.description },
              { label: 'Model', value: colorize(agent.model, 'cyan') },
              { label: 'Tools', value: toolNames.length > 0 ? colorize(toolNames.join(', '), 'cyan') : colorize('none', 'subtle') },
              { label: 'MCP', value: agent.mcp.length > 0 ? colorize(agent.mcp.join(', '), 'cyan') : colorize('none', 'subtle') },
            ],
          },
        ],
      }));
    } else {
      w(this.ui.error(`Agent "${sub}" not found. Run /agents to see available agents.`));
    }
  }

  async cmdSkills(args: string[], smartInput: ISmartInput): Promise<void> {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const skills = this.skillRegistry.getAllSkills();
      w(this.ui.panel({
        title: 'Skills',
        subtitle: `${skills.length} loaded`,
        sections: [
          {
            lines: skills.length === 0
              ? [colorize('No skills loaded. Run /skills create to create one.', 'muted')]
              : skills.map((s) => {
                const toolsPreview = s.tools.slice(0, 3).join(', ') + (s.tools.length > 3 ? '...' : '');
                return `${colorize(Icons.bullet, 'accent')} ${colorize(s.name, 'cyan')}  ${colorize(s.description, 'muted')} ${colorize(`[${toolsPreview}]`, 'subtle')}`;
              }),
          },
        ],
        footer: '/skills create starts the skill wizard.',
      }));
      return;
    }

    if (sub === 'create') {
      await this.createSkillWizard(smartInput);
      return;
    }

    w(this.ui.error(`Unknown subcommand: /skills ${sub}. Try /skills or /skills create.`));
  }

  private async createAgentWizard(smartInput: ISmartInput): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const castDir = path.join(process.cwd(), '.cast', 'agents');

    if (!fs.existsSync(castDir)) {
      fs.mkdirSync(castDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w(this.ui.panel({
      title: 'Create Agent',
      sections: [{ lines: [colorize('Choose a name. Cast will create a local .cast/agents file.', 'muted')] }],
    }));

    const name = await smartInput.question(colorize('  Name: ', 'cyan'));
    if (!name.trim()) {
      w(this.ui.warning('Cancelled.'));
      return;
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    const content = [
      '---',
      `name: ${name.trim()}`,
      'description: "Describe when this agent should be invoked"',
      'model: fast',
      'skills: []',
      'mcp: []',
      '---',
      '',
      '# Role',
      '',
      `You are ${name.trim()}, a specialized AI assistant.`,
      '',
      '# Guidelines',
      '',
      '- Follow the project conventions and established patterns',
      '- Be concise and precise in your responses',
      '- Ask clarifying questions before making significant changes',
      '',
      '# Output Format',
      '',
      'Respond with clear, actionable output. Use code blocks for code.',
      '',
    ].join('\n');

    const filePath = path.join(castDir, `${slug}.md`);
    fs.writeFileSync(filePath, content);

    w(this.ui.success(`Created ${filePath}`));

    this.openInEditor(filePath);
  }

  private async createSkillWizard(smartInput: ISmartInput): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    const castDir = path.join(process.cwd(), '.cast', 'skills');

    if (!fs.existsSync(castDir)) {
      fs.mkdirSync(castDir, { recursive: true });
    }

    const w = (s: string) => process.stdout.write(s);
    w(this.ui.panel({
      title: 'Create Skill',
      sections: [{ lines: [colorize('Choose a name. Cast will create a local .cast/skills file.', 'muted')] }],
    }));

    const name = await smartInput.question(colorize('  Name: ', 'cyan'));
    if (!name.trim()) {
      w(this.ui.warning('Cancelled.'));
      return;
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    const content = [
      '---',
      `name: ${name.trim()}`,
      'description: "Describe what this skill does and when to use it"',
      'tools: [read_file, write_file, edit_file, glob, grep]',
      '---',
      '',
      '# Purpose',
      '',
      `Explain the goal of the ${name.trim()} skill.`,
      '',
      '# Guidelines',
      '',
      '1. Step one',
      '2. Step two',
      '3. Step three',
      '',
      '# Output Format',
      '',
      'Describe what the output should look like.',
      '',
    ].join('\n');

    const filePath = path.join(castDir, `${slug}.md`);
    fs.writeFileSync(filePath, content);

    w(this.ui.success(`Created ${filePath}`));

    this.openInEditor(filePath);
  }

  private openInEditor(filePath: string): void {
    const { execSync } = require('child_process');
    const w = (s: string) => process.stdout.write(s);

    const editor = process.env.EDITOR || process.env.VISUAL;

    try {
      execSync(`code "${filePath}"`, { stdio: 'ignore' });
      w(this.ui.success('Opened in VS Code.'));
      return;
    } catch {}

    if (editor) {
      try {
        execSync(`${editor} "${filePath}"`, { stdio: 'ignore' });
        w(this.ui.success(`Opened in ${editor}.`));
        return;
      } catch {}
    }

    w(this.ui.warning(`Open the file to edit: ${filePath}`));
  }
}
