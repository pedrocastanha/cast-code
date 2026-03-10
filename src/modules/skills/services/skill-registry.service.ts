import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { SkillLoaderService } from './skill-loader.service';
import { ToolsRegistryService } from '../../tools/services/tools-registry.service';
import { ResolvedSkill, SkillDefinition } from '../types';

@Injectable()
export class SkillRegistryService {
  constructor(
    private readonly skillLoader: SkillLoaderService,
    @Inject(forwardRef(() => ToolsRegistryService))
    private readonly toolsRegistry: ToolsRegistryService,
  ) {}

  resolveSkill(name: string): ResolvedSkill | undefined {
    const skill = this.skillLoader.getSkill(name);

    if (!skill) {
      return undefined;
    }

    return {
      name: skill.name,
      description: skill.description,
      tools: this.toolsRegistry.getTools(skill.tools),
      guidelines: skill.guidelines,
    };
  }

  resolveSkills(names: string[]): ResolvedSkill[] {
    return names
      .map((name) => this.resolveSkill(name))
      .filter((s): s is ResolvedSkill => s !== undefined);
  }

  getToolsForSkills(skillNames: string[]): StructuredTool[] {
    const skills = this.resolveSkills(skillNames);
    const toolsMap = new Map<string, StructuredTool>();

    for (const skill of skills) {
      for (const t of skill.tools as StructuredTool[]) {
        toolsMap.set(t.name, t);
      }
    }

    return Array.from(toolsMap.values());
  }

  getIsolatedToolsForSkills(skillNames: string[]): StructuredTool[] {
    const toolsMap = new Map<string, StructuredTool>();

    for (const skillName of skillNames) {
      const skill = this.skillLoader.getSkill(skillName);
      if (!skill) continue;
      for (const t of this.toolsRegistry.getIsolatedTools(skill.tools)) {
        toolsMap.set(t.name, t);
      }
    }

    return Array.from(toolsMap.values());
  }

  getGuidelinesForSkills(skillNames: string[]): string {
    const skills = this.resolveSkills(skillNames);

    return skills.map((s) => `## ${s.name}\n${s.guidelines}`).join('\n\n');
  }


  getAllSkills(): SkillDefinition[] {
    return this.skillLoader.getAllSkills();
  }

  getSkillNames(): string[] {
    return this.skillLoader.getSkillNames();
  }

  async loadProjectSkills(projectPath: string) {
    await this.skillLoader.loadFromPath(projectPath);
  }

  getSkillSummaries(): { name: string; description: string }[] {
    const skills = this.skillLoader.getAllSkills();
    return skills.map(s => ({
      name: s.name,
      description: s.description || 'No description',
    }));
  }
}
