import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentLoaderService } from '../../agents/services/agent-loader.service';
import { SkillLoaderService } from '../../skills/services/skill-loader.service';
import { VaultService } from '../../vault/services/vault.service';
import { ImpactAnalysisService } from './impact-analysis.service';

/**
 * Extract up to `max` meaningful bullet points from markdown content.
 * Scans for list items (lines starting with "- " or "* " or "N. ") and
 * returns the first `max` non-empty ones, each trimmed to 80 chars.
 */
function extractBulletPoints(content: string, max = 3): string[] {
  if (!content) return [];
  const lines = content.split('\n');
  const bullets: string[] = [];
  for (const line of lines) {
    if (bullets.length >= max) break;
    const trimmed = line.trim();
    // Match markdown list items: "- text", "* text", "1. text"
    const match = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)/);
    if (match && match[1]) {
      const text = match[1].trim();
      if (text.length > 0) {
        bullets.push(text.length > 80 ? text.slice(0, 77) + '...' : text);
      }
    }
  }
  return bullets;
}

@Injectable()
export class DiscoveryToolsService {
  constructor(
    private readonly agentLoader: AgentLoaderService,
    private readonly skillLoader: SkillLoaderService,
    private readonly vaultService: VaultService,
    private readonly impactAnalysisService: ImpactAnalysisService,
  ) {}

  getTools() {
    return [
      this.createListSkillsTool(),
      this.createReadSkillTool(),
      this.createListAgentsTool(),
      this.createSaveSnippetTool(),
      this.createAnalyzeImpactTool(),
    ];
  }

  private createListSkillsTool() {
    const self = this;
    return tool(
      async (_input: {}) => {
        const skills = self.skillLoader.getAllSkills();
        if (skills.length === 0) return 'No skills loaded.';

        const sections = skills.map((s) => {
          const bullets = extractBulletPoints(s.guidelines || '', 3);
          const guidelinesPreview =
            bullets.length > 0
              ? bullets.map((b) => `  - ${b}`).join('\n')
              : '  (no guidelines preview available)';

          return [
            `### ${s.name}`,
            `**Purpose:** ${s.description || 'No description'}`,
            `**Key guidelines:**`,
            guidelinesPreview,
            `**Load full content:** read_skill("${s.name}")`,
          ].join('\n');
        });

        return `## Available Skills (${skills.length})\n\n` + sections.join('\n\n');
      },
      {
        name: 'list_skills',
        description:
          'List all available skills with descriptions and a preview of key guidelines. Call read_skill(name) to get the full content of a skill.',
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
        return (
          '## Skill: ' +
          skill.name +
          '\n\n**Description:** ' +
          skill.description +
          '\n\n**Guidelines:**\n' +
          (skill.guidelines || '(none)')
        );
      },
      {
        name: 'read_skill',
        description:
          'Load the full content of a specific skill by name. Use list_skills first to see what is available.',
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

        const sections = agents.map((a) => {
          const bullets = extractBulletPoints(a.systemPrompt || '', 3);
          const specializes =
            bullets.length > 0
              ? bullets.map((b) => `  - ${b}`).join('\n')
              : '  (see systemPrompt for details)';

          const mcpNote =
            a.mcp && a.mcp.length > 0
              ? `\n**MCP access:** ${a.mcp.join(', ')}`
              : '';

          return [
            `### ${a.name}`,
            `**Role:** ${a.description || 'No description'}`,
            `**Specializes in:**`,
            specializes,
            `**Best for:** Tasks that require focused ${a.description ? a.description.toLowerCase() : 'domain'} expertise${mcpNote}`,
            `**Dispatch in background:**`,
            `  → delegate to agent: "${a.name}" with a focused task description`,
            `  → include all necessary context in the task`,
            `  → track with task_create before dispatching`,
          ].join('\n');
        });

        return `## Available Sub-Agents (${agents.length})\n\n` + sections.join('\n\n');
      },
      {
        name: 'list_agents',
        description:
          'List all available specialized sub-agents with descriptions, capabilities, and dispatch instructions. Use to decide which agent to delegate work to.',
        schema: z.object({}),
      },
    );
  }

  private createSaveSnippetTool() {
    const self = this;
    return tool(
      async (input: { name: string; code: string; description: string; language?: string }) => {
        self.vaultService.saveSnippet(input.name, input.code, input.description, input.language || 'typescript');
        return `Snippet "${input.name}" saved to vault. User can view it with /vault show "${input.name}".`;
      },
      {
        name: 'save_snippet',
        description: 'Save a reusable code snippet to the personal vault. Use when you create a useful pattern, utility, or solution worth reusing across projects.',
        schema: z.object({
          name: z.string().describe('Short identifier (e.g. "auth-middleware", "retry-helper")'),
          code: z.string().describe('The complete code content'),
          description: z.string().describe('What this snippet does and when to use it'),
          language: z.string().optional().describe('Programming language (default: typescript)'),
        }),
      },
    );
  }

  private createAnalyzeImpactTool() {
    const self = this;
    return tool(
      async (input: { file: string }) => {
        const result = self.impactAnalysisService.analyze(input.file);
        return result.summary;
      },
      {
        name: 'analyze_impact',
        description: 'Analyze which files depend on a given file before making changes. Call before editing files that export public APIs or are widely imported.',
        schema: z.object({
          file: z.string().describe('File path to analyze (relative to project root, e.g. src/modules/auth/auth.service.ts)'),
        }),
      },
    );
  }
}
