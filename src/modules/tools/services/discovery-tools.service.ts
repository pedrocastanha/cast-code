import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentLoaderService } from '../../agents/services/agent-loader.service';
import { SkillLoaderService } from '../../skills/services/skill-loader.service';

@Injectable()
export class DiscoveryToolsService {
  constructor(
    private readonly agentLoader: AgentLoaderService,
    private readonly skillLoader: SkillLoaderService,
  ) {}

  getTools() {
    return [
      this.createListSkillsTool(),
      this.createReadSkillTool(),
      this.createListAgentsTool(),
    ];
  }

  private createListSkillsTool() {
    const self = this;
    return tool(
      async (_input: {}) => {
        const skills = self.skillLoader.getAllSkills();
        if (skills.length === 0) return 'No skills loaded.';
        const lines = skills.map((s) =>
          '- **' + s.name + '**: ' + (s.description || 'No description') + '\n  -> Load full content: read_skill("' + s.name + '")',
        );
        return '## Available Skills (' + skills.length + ')\n\n' + lines.join('\n');
      },
      {
        name: 'list_skills',
        description: 'List all available skills with descriptions. Call read_skill(name) to get the full content of a skill.',
        schema: z.object({}),
      },
    );
  }

  private createReadSkillTool() {
    const self = this;
    return tool(
      async (input: { name: string }) => {
        const skill = self.skillLoader.getSkill(input.name);
        if (!skill) {
          const available = self.skillLoader.getSkillNames().join(', ');
          return 'Skill "' + input.name + '" not found. Available: ' + available;
        }
        return '## Skill: ' + skill.name + '\n\n**Description:** ' + skill.description + '\n\n**Guidelines:**\n' + (skill.guidelines || '(none)');
      },
      {
        name: 'read_skill',
        description: 'Load the full content of a specific skill by name. Use list_skills first to see what is available.',
        schema: z.object({
          name: z.string().describe('Skill name from list_skills'),
        }),
      },
    );
  }

  private createListAgentsTool() {
    const self = this;
    return tool(
      async (_input: {}) => {
        const agents = self.agentLoader.getAllAgents();
        if (agents.length === 0) return 'No sub-agents loaded.';
        const lines = agents.map((a) => '- **' + a.name + '**: ' + a.description);
        return '## Available Sub-Agents (' + agents.length + ')\n\n' + lines.join('\n');
      },
      {
        name: 'list_agents',
        description: 'List all available specialized sub-agents with descriptions. Use to decide which agent to delegate work to.',
        schema: z.object({}),
      },
    );
  }
}
