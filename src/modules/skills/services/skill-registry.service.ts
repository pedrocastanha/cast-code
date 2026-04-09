import { Injectable } from '@nestjs/common';
import { StructuredTool } from '@langchain/core/tools';
import { SkillLoaderService } from './skill-loader.service';
import { CapabilityRegistryService } from '../../capabilities';
import { ResolvedSkill, SkillDefinition } from '../types';

@Injectable()
export class SkillRegistryService {
  constructor(
    private readonly skillLoader: SkillLoaderService,
    private readonly capabilityRegistry: CapabilityRegistryService,
  ) {}

  onModuleInit() {
    const skills = this.skillLoader.getAllSkills().map(s => ({
      name: s.name,
      description: s.description,
      tools: s.tools,
      guidelines: s.guidelines,
    }));
    this.capabilityRegistry.registerSkills(skills);
  }

  resolveSkill(name: string): ResolvedSkill | undefined {
    const skill = this.skillLoader.getSkill(name);
    if (!skill) return undefined;

    return {
      name: skill.name,
      description: skill.description,
      tools: this.capabilityRegistry.getToolsByNames(skill.tools),
      guidelines: skill.guidelines,
    };
  }

  resolveSkills(names: string[]): ResolvedSkill[] {
    return names
      .map((name) => this.resolveSkill(name))
      .filter((s): s is ResolvedSkill => s !== undefined);
  }

  getToolsForSkills(skillNames: string[]): StructuredTool[] {
    return this.capabilityRegistry.getSkillsForTools(skillNames);
  }

  getIsolatedToolsForSkills(skillNames: string[]): StructuredTool[] {
    const skills = skillNames
      .map((name) => this.skillLoader.getSkill(name))
      .filter((s): s is SkillDefinition => s !== undefined);

    const toolNames = skills.flatMap(s => s.tools);
    return this.capabilityRegistry.getToolsByNames(toolNames);
  }

  getGuidelinesForSkills(skillNames: string[]): string {
    return this.capabilityRegistry.getSkillGuidelines(skillNames);
  }

  getAllSkills(): SkillDefinition[] {
    return this.skillLoader.getAllSkills();
  }

  getSkillNames(): string[] {
    return this.skillLoader.getSkillNames();
  }

  async loadProjectSkills(projectPath: string) {
    await this.skillLoader.loadFromPath(projectPath);
    const skills = this.skillLoader.getAllSkills().map(s => ({
      name: s.name,
      description: s.description,
      tools: s.tools,
      guidelines: s.guidelines,
    }));
    this.capabilityRegistry.registerSkills(skills);
  }

  getSkillSummaries(): { name: string; description: string }[] {
    const skills = this.skillLoader.getAllSkills();
    return skills.map(s => ({
      name: s.name,
      description: s.description || 'No description',
    }));
  }
}
