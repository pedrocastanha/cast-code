import { Injectable, Optional } from '@nestjs/common';
import { colorize, Icons } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';
import { AgentRegistryService } from '../../../agents/services/agent-registry.service';
import { SkillRegistryService } from '../../../skills/services/skill-registry.service';
import { SkillSearchService } from '../../../skills/services/skill-search.service';
import { SkillsImportCommandsService } from '../../../skills-import/commands/skills-import-commands.service';
import { ISmartInput } from '../smart-input';

@Injectable()
export class AgentCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly skillRegistry: SkillRegistryService,
    @Optional() private readonly skillsImportCommands?: SkillsImportCommandsService,
    @Optional() private readonly skillSearch?: SkillSearchService,
  ) {}

  async cmdAgents(args: string[], smartInput: ISmartInput): Promise<void> {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const flags = this.parseFlags(args.slice(1));
      const agents = this.agentRegistry.resolveAllAgents()
        .filter((agent) => !flags.env || this.agentRegistry.getAllUnscopedAgents()
          .find((definition) => definition.name === agent.name)?.environments?.includes(flags.env));
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
        footer: '/agents inspect <name> shows details. /agents create starts the agent wizard.',
      }));
      return;
    }

    if (sub === 'inspect') {
      args = args.slice(1);
    }

    if (sub === 'create') {
      await this.createAgentWizard(smartInput);
      return;
    }

    const agent = this.agentRegistry.resolveAgent(args[0] ?? sub);
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
      w(this.ui.error(`Agent "${args[0] ?? sub}" not found. Run /agents to see available agents.`));
    }
  }

  async cmdSkills(args: string[], smartInput: ISmartInput): Promise<void> {
    const sub = args[0];
    const w = (s: string) => process.stdout.write(s);

    if (!sub || sub === 'list') {
      const flags = this.parseFlags(args.slice(1));
      const skills = this.skillRegistry.getAllSkills()
        .filter((skill) => !flags.env || skill.environments?.includes(flags.env))
        .filter((skill) => !flags.risk || skill.risk === flags.risk);
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
        footer: '/skills search <query> finds skills and agents. /skills inspect <name> shows metadata.',
      }));
      return;
    }

    if (sub === 'search') {
      const query = this.parseQueryArgs(args.slice(1));
      const flags = this.parseFlags(args.slice(1));
      const search = this.skillSearch ?? new SkillSearchService();
      const results = search.search({
        query,
        includeQuarantined: flags.includeQuarantined,
        risk: flags.risk as any,
        activeEnvironment: flags.env,
        skills: this.skillRegistry.getAllUnscopedSkills(),
        agents: this.agentRegistry.getAllUnscopedAgents(),
      });
      w(this.ui.panel({
        title: 'Skill Search',
        subtitle: query || 'all',
        sections: [
          {
            lines: results.length === 0
              ? [colorize('No matching skills or agents.', 'muted')]
              : results.map((result) => `${colorize(Icons.bullet, result.kind === 'agent' ? 'primary' : 'accent')} ${colorize(result.kind, 'subtle')} ${colorize(result.name, 'cyan')}  ${colorize(result.description, 'muted')} ${colorize(`[${result.reason}]`, 'subtle')}`),
          },
        ],
      }));
      return;
    }

    if (sub === 'create') {
      await this.createSkillWizard(smartInput);
      return;
    }

    if (sub === 'inspect') {
      const name = args[1];
      if (!name) {
        w(this.ui.error('Usage: /skills inspect <name>'));
        return;
      }
      const skill = this.skillRegistry.getSkillDefinition(name, { includeInactive: true });
      if (!skill) {
        w(this.ui.error(`Skill "${name}" not found. Run /skills to see available skills.`));
        return;
      }

      const supportFiles = skill.supportFiles || [];
      w(this.ui.panel({
        title: 'Skill',
        subtitle: skill.name,
        sections: [
          {
            rows: [
              { label: 'Description', value: skill.description || colorize('none', 'subtle') },
              { label: 'Aliases', value: skill.aliases?.length ? colorize(skill.aliases.join(', '), 'cyan') : colorize('none', 'subtle') },
              { label: 'Category', value: skill.category || colorize('none', 'subtle') },
              { label: 'Risk', value: skill.risk ? colorize(skill.risk, skill.risk === 'critical' ? 'error' : 'warning') : colorize('unset', 'subtle') },
              { label: 'Trust', value: skill.trust || colorize('unset', 'subtle') },
              { label: 'Active', value: skill.isActive === false ? colorize('no', 'warning') : colorize('yes', 'success') },
              { label: 'Environments', value: skill.environments?.length ? skill.environments.join(', ') : colorize('none', 'subtle') },
              { label: 'Profiles', value: skill.profiles?.length ? skill.profiles.join(', ') : colorize('none', 'subtle') },
            ],
          },
          {
            title: 'Support files',
            lines: supportFiles.length > 0
              ? supportFiles.slice(0, 25).map((file) => `${colorize(Icons.bullet, 'accent')} ${file}`)
              : [colorize('No support files.', 'muted')],
          },
        ],
        footer: supportFiles.length > 0
          ? `Use skill_view("${skill.name}", filePath) for references, templates, scripts, or assets.`
          : undefined,
      }));
      return;
    }

    if (sub === 'import') {
      if (!this.skillsImportCommands) {
        w(this.ui.error('Skills import commands are not available in this build.'));
        return;
      }
      const result = await this.skillsImportCommands.handle(args);
      w(result.ok ? this.ui.success(result.message) : this.ui.error(result.message));
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

  private parseFlags(args: string[]): { env?: string; risk?: string; includeQuarantined?: boolean } {
    const flags: { env?: string; risk?: string; includeQuarantined?: boolean } = {};
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (arg === '--env') {
        flags.env = args[i + 1];
        i += 1;
      }
      if (arg === '--risk') {
        flags.risk = args[i + 1];
        i += 1;
      }
      if (arg === '--include-quarantined') flags.includeQuarantined = true;
    }
    return flags;
  }

  private parseQueryArgs(args: string[]): string {
    const valueFlags = new Set(['--env', '--risk']);
    const parts: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (valueFlags.has(arg)) {
        i += 1;
        continue;
      }
      if (arg.startsWith('--')) {
        if (args[i + 1] && !args[i + 1].startsWith('--')) {
          i += 1;
        }
        continue;
      }
      parts.push(arg);
    }
    return parts.join(' ').trim();
  }
}
