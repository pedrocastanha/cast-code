import { Injectable, Global, OnModuleInit } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import {
  ToolCapability,
  SkillCapability,
  AgentCapability,
  ResolvedCapability,
} from './types';

@Global()
@Injectable()
export class CapabilityRegistryService implements OnModuleInit {
  private toolSources = new Map<string, ToolCapability[]>();
  private skills = new Map<string, SkillCapability>();
  private agents = new Map<string, AgentCapability>();
  private rootDir = process.cwd();
  private rootDirSetters: ((dir: string) => void)[] = [];

  onModuleInit() {
    this.rootDir = process.cwd();
  }

  registerRootDirSetter(setter: (dir: string) => void) {
    this.rootDirSetters.push(setter);
  }

  registerToolSource(source: string, tools: ToolCapability[]) {
    this.toolSources.set(source, tools);
  }

  unregisterToolSource(source: string) {
    this.toolSources.delete(source);
  }

  registerSkills(skills: SkillCapability[]) {
    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }
  }

  registerAgents(agents: AgentCapability[]) {
    for (const agent of agents) {
      this.agents.set(agent.name, agent);
    }
  }

  getAllTools(): StructuredTool[] {
    const tools: StructuredTool[] = [];
    for (const [, caps] of this.toolSources) {
      for (const cap of caps) {
        tools.push(...cap.getter());
      }
    }
    return tools;
  }

  getToolsByNames(names: string[]): StructuredTool[] {
    const allTools = this.getAllTools();
    const toolMap = new Map<string, StructuredTool>();
    for (const t of allTools) {
      toolMap.set(t.name, t);
    }
    return names
      .map((name) => toolMap.get(name))
      .filter((t): t is StructuredTool => t !== undefined);
  }

  getToolNames(): string[] {
    const names: string[] = [];
    for (const [, caps] of this.toolSources) {
      for (const cap of caps) {
        for (const tool of cap.getter()) {
          names.push(tool.name);
        }
      }
    }
    return names;
  }

  getSkill(name: string): SkillCapability | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): SkillCapability[] {
    return Array.from(this.skills.values());
  }

  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }

  getAgent(name: string): AgentCapability | undefined {
    return this.agents.get(name);
  }

  getAllAgents(): AgentCapability[] {
    return Array.from(this.agents.values());
  }

  getAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }

  resolveSkill(name: string): ResolvedCapability | undefined {
    const skill = this.skills.get(name);
    if (!skill) return undefined;

    const tools = this.getToolsByNames(skill.tools);
    return {
      name: skill.name,
      description: skill.description,
      tools,
      systemPrompt: undefined,
    };
  }

  resolveSkills(names: string[]): ResolvedCapability[] {
    return names
      .map((name) => this.resolveSkill(name))
      .filter((s): s is ResolvedCapability => s !== undefined);
  }

  getSkillGuidelines(names: string[]): string {
    const skills = names
      .map((name) => this.skills.get(name))
      .filter((s): s is SkillCapability => s !== undefined);
    return skills.map((s) => `## ${s.name}\n${s.guidelines}`).join('\n\n');
  }

  getSkillsForTools(skillNames: string[]): StructuredTool[] {
    const skills = this.resolveSkills(skillNames);
    const toolMap = new Map<string, StructuredTool>();
    for (const skill of skills) {
      for (const t of skill.tools) {
        toolMap.set(t.name, t);
      }
    }
    return Array.from(toolMap.values());
  }

  getClear() {
    this.toolSources.clear();
    this.skills.clear();
    this.agents.clear();
  }

  setRootDir(dir: string) {
    this.rootDir = dir;
    for (const setter of this.rootDirSetters) {
      setter(dir);
    }
  }

  getRootDir(): string {
    return this.rootDir;
  }
}
