import { Injectable, OnModuleInit } from '@nestjs/common';
import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { SkillFrontmatter, SkillDefinition } from '../types';
import * as path from 'path';

@Injectable()
export class SkillLoaderService implements OnModuleInit {
  private skills: Map<string, SkillDefinition> = new Map();
  private definitionsPath: string;

  constructor(private readonly markdownParser: MarkdownParserService) {
    this.definitionsPath = path.join(__dirname, '..', 'definitions');
  }

  async onModuleInit() {
    await this.loadSkills();
  }

  async loadSkills() {
    const exists = await this.markdownParser.exists(this.definitionsPath);

    if (!exists) {
      return;
    }

    const parsed = await this.markdownParser.parseAll<SkillFrontmatter>(this.definitionsPath);

    for (const [name, { frontmatter, content }] of parsed) {
      this.skills.set(name, {
        name: frontmatter.name || name,
        description: frontmatter.description || '',
        tools: frontmatter.tools || [],
        guidelines: content,
      });
    }
  }

  async loadFromPath(customPath: string) {
    const exists = await this.markdownParser.exists(customPath);

    if (!exists) {
      return;
    }

    const parsed = await this.markdownParser.parseAll<SkillFrontmatter>(customPath);

    for (const [name, { frontmatter, content }] of parsed) {
      this.skills.set(name, {
        name: frontmatter.name || name,
        description: frontmatter.description || '',
        tools: frontmatter.tools || [],
        guidelines: content,
      });
    }
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }
}
