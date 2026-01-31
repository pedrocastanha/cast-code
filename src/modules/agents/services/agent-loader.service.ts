import { Injectable, OnModuleInit } from '@nestjs/common';
import { MarkdownParserService } from '../../../common/services/markdown-parser.service';
import { AgentFrontmatter, AgentDefinition } from '../types';
import { DEFAULT_MODEL, DEFAULT_TEMPERATURE } from '../../../common/constants';
import * as path from 'path';

@Injectable()
export class AgentLoaderService implements OnModuleInit {
  private agents: Map<string, AgentDefinition> = new Map();
  private definitionsPath: string;

  constructor(private readonly markdownParser: MarkdownParserService) {
    this.definitionsPath = path.join(__dirname, '..', 'definitions');
  }

  async onModuleInit() {
    await this.loadAgents();
  }

  async loadAgents() {
    const exists = await this.markdownParser.exists(this.definitionsPath);

    if (!exists) {
      return;
    }

    const parsed = await this.markdownParser.parseAll<AgentFrontmatter>(this.definitionsPath);

    for (const [name, { frontmatter, content }] of parsed) {
      this.agents.set(frontmatter.name || name, {
        name: frontmatter.name || name,
        description: frontmatter.description || '',
        model: frontmatter.model || DEFAULT_MODEL,
        temperature: frontmatter.temperature ?? DEFAULT_TEMPERATURE,
        skills: frontmatter.skills || [],
        mcp: frontmatter.mcp || [],
        systemPrompt: content,
      });
    }
  }

  async loadFromPath(customPath: string) {
    const exists = await this.markdownParser.exists(customPath);

    if (!exists) {
      return;
    }

    const parsed = await this.markdownParser.parseAll<AgentFrontmatter>(customPath);

    for (const [name, { frontmatter, content }] of parsed) {
      const existingAgent = this.agents.get(frontmatter.name || name);

      if (existingAgent) {
        this.agents.set(frontmatter.name || name, {
          ...existingAgent,
          skills: [...new Set([...existingAgent.skills, ...(frontmatter.skills || [])])],
          mcp: [...new Set([...existingAgent.mcp, ...(frontmatter.mcp || [])])],
          systemPrompt: content || existingAgent.systemPrompt,
          model: frontmatter.model || existingAgent.model,
          temperature: frontmatter.temperature ?? existingAgent.temperature,
        });
      } else {
        this.agents.set(frontmatter.name || name, {
          name: frontmatter.name || name,
          description: frontmatter.description || '',
          model: frontmatter.model || DEFAULT_MODEL,
          temperature: frontmatter.temperature ?? DEFAULT_TEMPERATURE,
          skills: frontmatter.skills || [],
          mcp: frontmatter.mcp || [],
          systemPrompt: content,
        });
      }
    }
  }

  getAgent(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  getAllAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  getAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }
}
