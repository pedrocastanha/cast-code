import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { AgentLoaderService } from './agent-loader.service';
import { SkillRegistryService } from '../../skills/services/skill-registry.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { McpRegistryService } from '../../mcp/services/mcp-registry.service';
import { ResolvedAgent, SubagentDefinition } from '../types';

const FALLBACK_TOOL_NAMES = ['read_file', 'glob', 'grep', 'ls'];

@Injectable()
export class AgentRegistryService {
  constructor(
    private readonly agentLoader: AgentLoaderService,
    @Inject(forwardRef(() => SkillRegistryService))
    private readonly skillRegistry: SkillRegistryService,
    @Inject(forwardRef(() => ToolsRegistryService))
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly mcpRegistry: McpRegistryService,
  ) {}

  resolveAgent(name: string, projectContext?: string, isolated = false): ResolvedAgent | undefined {
    const agent = this.agentLoader.getAgent(name);

    if (!agent) {
      return undefined;
    }

    let skillTools = isolated
      ? this.skillRegistry.getIsolatedToolsForSkills(agent.skills)
      : this.skillRegistry.getToolsForSkills(agent.skills);
    const skillGuidelines = this.skillRegistry.getGuidelinesForSkills(agent.skills);

    if (skillTools.length === 0 && agent.skills.length > 0) {
      const knownSkills = this.skillRegistry.getAllSkills().map(s => s.name);
      const unknown = agent.skills.filter(s => !knownSkills.includes(s));
      if (unknown.length > 0) {
        process.stderr.write(`[warn] agent "${agent.name}" references unknown skills: ${unknown.join(', ')} — falling back to default tools\n`);
      }
      skillTools = isolated
        ? this.toolsRegistry.getIsolatedTools(FALLBACK_TOOL_NAMES)
        : this.toolsRegistry.getTools(FALLBACK_TOOL_NAMES);
    }

    let mcpTools: StructuredTool[] = [];
    if (agent.mcp && agent.mcp.length > 0) {
      for (const mcpName of agent.mcp) {
        mcpTools.push(...this.mcpRegistry.getMcpTools(mcpName));
      }
    }

    const allTools = [...skillTools, ...mcpTools];

    let systemPrompt = agent.systemPrompt;

    if (skillGuidelines) {
      systemPrompt += `\n\n# Skills Guidelines\n${skillGuidelines}`;
    }

    if (allTools.length > 0) {
      const toolNames = allTools.map(t => t.name).join(', ');
      systemPrompt += `\n\n# Your Available Tools\nYou have access to these tools ONLY: ${toolNames}\nDo NOT attempt to use tools not in this list.`;
    }

    systemPrompt += `\n\n# Execution Rules\n- Always use RELATIVE paths (e.g. \`src/index.ts\`). NEVER use absolute paths starting with \`/\` or \`~\`.\n- Execute your task completely. Do NOT ask for confirmation or leave work half-done.\n- After writing a file, re-read it to verify the result.`;

    if (projectContext) {
      systemPrompt += `\n\n# Project Context\n${projectContext}`;
    }

    return {
      name: agent.name,
      description: agent.description,
      model: agent.model,
      temperature: agent.temperature,
      tools: allTools,
      systemPrompt,
      mcp: agent.mcp,
    };
  }

  resolveAllAgents(projectContext?: string): ResolvedAgent[] {
    const agents = this.agentLoader.getAllAgents();

    return agents
      .map((a) => this.resolveAgent(a.name, projectContext, true))
      .filter((a): a is ResolvedAgent => a !== undefined);
  }

  getSubagentDefinitions(projectContext?: string): SubagentDefinition[] {
    const agents = this.resolveAllAgents(projectContext);

    return agents.map((agent) => ({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools,
      mcp: agent.mcp,
    }));
  }

  async loadProjectAgents(projectPath: string) {
    await this.agentLoader.loadFromPath(projectPath);
  }
}
