import { Injectable } from '@nestjs/common';
import matter from 'gray-matter';
import { DEFAULT_MODEL, DEFAULT_TEMPERATURE } from '../../../common/constants';
import { AgentDefinition } from '../../agents/types';
import { SkillDefinition } from '../../skills/types';
import { RemoteAgentPayload, RemoteSkillPayload } from '../types';

@Injectable()
export class RemoteDefinitionAdapterService {
  adaptSkills(skills: RemoteSkillPayload[]): SkillDefinition[] {
    return skills.map((skill) => {
      const parsed = matter(skill.content || '');
      return {
        name: String(parsed.data.name || skill.name),
        description: String(parsed.data.description || ''),
        tools: Array.isArray(parsed.data.tools) ? parsed.data.tools.map(String) : [],
        guidelines: parsed.content,
        source: 'remote',
        updatedAt: skill.updatedAt,
      };
    });
  }

  adaptAgents(agents: RemoteAgentPayload[]): AgentDefinition[] {
    return agents.map((agent) => {
      const parsed = matter(agent.systemPrompt || '');
      return {
        name: String(parsed.data.name || agent.role),
        description: String(parsed.data.description || 'Remote platform agent'),
        model: agent.model || DEFAULT_MODEL,
        temperature: typeof parsed.data.temperature === 'number' ? parsed.data.temperature : DEFAULT_TEMPERATURE,
        skills: Array.isArray(parsed.data.skills) ? parsed.data.skills.map(String) : [],
        mcp: Array.isArray(parsed.data.mcp) ? parsed.data.mcp.map(String) : [],
        systemPrompt: parsed.content,
        source: 'remote',
        updatedAt: agent.updatedAt,
      };
    });
  }
}
