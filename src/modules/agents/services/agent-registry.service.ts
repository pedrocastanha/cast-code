import { Injectable } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { AgentLoaderService } from './agent-loader.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { ResolvedAgent, SubagentDefinition } from '../types';

@Injectable()
export class AgentRegistryService {
  constructor(
    private readonly agentLoader: AgentLoaderService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  resolveAgent(name: string, projectContext?: string): ResolvedAgent | undefined {
    const agent = this.agentLoader.getAgent(name);

    if (!agent) {
      return undefined;
    }

    const skillTools = this.skillRegistry.getToolsForSkills(agent.skills);
    const skillGuidelines = this.skillRegistry.getGuidelinesForSkills(agent.skills);

    let systemPrompt = agent.systemPrompt;

    if (skillGuidelines) {
      systemPrompt += `\n\n# Skills Guidelines\n${skillGuidelines}`;
    }

    if (projectContext) {
      systemPrompt += `\n\n# Project Context\n${projectContext}`;
    }

    return {
      name: agent.name,
      description: agent.description,
      model: agent.model,
      temperature: agent.temperature,
      tools: skillTools,
      systemPrompt,
      mcp: agent.mcp,
    };
  }

  resolveAllAgents(projectContext?: string): ResolvedAgent[] {
    const agents = this.agentLoader.getAllAgents();

    return agents
      .map((a) => this.resolveAgent(a.name, projectContext))
      .filter((a): a is ResolvedAgent => a !== undefined);
  }

  getSubagentDefinitions(projectContext?: string): SubagentDefinition[] {
    const agents = this.resolveAllAgents(projectContext);

    return agents.map((agent) => ({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools,
    }));
  }

  async loadProjectAgents(projectPath: string) {
    await this.agentLoader.loadFromPath(projectPath);
  }
}
