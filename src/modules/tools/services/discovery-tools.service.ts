import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AgentLoaderService } from '../../agents/services/agent-loader.service';
import { SkillLoaderService } from '../../skills/services/skill-loader.service';
import { VaultService } from '../../vault/services/vault.service';
import { ImpactAnalysisService } from './impact-analysis.service';
import { BRIDGE_PROVIDER_IDS } from '../../bridge/types/bridge.types';

type CastCommandHandler = (command: string) => Promise<string> | string;

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
  private castCommandHandler: CastCommandHandler | null = null;

  constructor(
    private readonly agentLoader: AgentLoaderService,
    private readonly skillLoader: SkillLoaderService,
    private readonly vaultService: VaultService,
    private readonly impactAnalysisService: ImpactAnalysisService,
  ) {}

  setCastCommandHandler(handler: CastCommandHandler): void {
    this.castCommandHandler = handler;
  }

  getTools() {
    return [
      this.createListSkillsTool(),
      this.createReadSkillTool(),
      this.createListAgentsTool(),
      this.createSaveSnippetTool(),
      this.createAnalyzeImpactTool(),
      this.createListCommandsTool(),
      this.createCastCommandTool(),
    ];
  }

  private createListSkillsTool() {
    return tool(
      async () => {
        const skills = this.skillLoader.getAllSkills();
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
            '**Key guidelines:**',
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
    return tool(
      async (input: { name: string }) => {
        const skill = this.skillLoader.getSkill(input.name);
        if (!skill) {
          const available = this.skillLoader.getSkillNames().join(', ');
          return 'Skill "' + input.name + '" not found. Available: ' + available;
        }
        const supportFiles = skill.supportFiles || [];
        const supportSection = supportFiles.length > 0
          ? '\n\n**Support files:**\n' +
            supportFiles.slice(0, 25).map((file) => '- ' + file).join('\n') +
            (supportFiles.length > 25 ? `\n... (${supportFiles.length - 25} more)` : '') +
            '\n\nUse list_skill_files("' + skill.name + '") and skill_view("' + skill.name + '", filePath) for references, templates, scripts, or assets.'
          : '';
        return (
          '## Skill: ' +
          skill.name +
          '\n\n**Description:** ' +
          skill.description +
          '\n\n**Guidelines:**\n' +
          (skill.guidelines || '(none)') +
          supportSection
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
    return tool(
      async () => {
        const agents = this.agentLoader.getAllAgents();
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
            '**Specializes in:**',
            specializes,
            `**Best for:** Tasks that require focused ${a.description ? a.description.toLowerCase() : 'domain'} expertise${mcpNote}`,
            '**Dispatch in background:**',
            `  → delegate to agent: "${a.name}" with a focused task description`,
            '  → include all necessary context in the task',
            '  → track with task_create before dispatching',
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
    return tool(
      async (input: { name: string; code: string; description: string; language?: string }) => {
        this.vaultService.saveSnippet(input.name, input.code, input.description, input.language || 'typescript');
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

  private createListCommandsTool() {
    const COMMANDS: { section: string; items: { name: string; desc: string }[] }[] = [
      {
        section: 'General',
        items: [
          { name: '/help', desc: 'show command reference' },
          { name: '/clear', desc: 'clear conversation history' },
          { name: '/compact', desc: 'summarize and compress history' },
          { name: '/context', desc: 'show session info (model, tokens, agents, MCP)' },
          { name: '/exit', desc: 'quit' },
        ],
      },
      {
        section: 'Git',
        items: [
          { name: '/status', desc: 'git status' },
          { name: '/diff [ref]', desc: 'git diff' },
          { name: '/log', desc: 'recent commits' },
          { name: '/commit [msg]', desc: 'AI-assisted or manual commit' },
          { name: '/up', desc: 'smart commit & push' },
          { name: '/split-up', desc: 'split staged changes into multiple commits' },
          { name: '/pr', desc: 'create PR with AI-generated description' },
          { name: '/unit-test', desc: 'generate unit tests for branch changes' },
          { name: '/review [files]', desc: 'AI code review' },
          { name: '/fix <file>', desc: 'auto-fix code issues in a file' },
          { name: '/ident', desc: 'format all code files' },
          { name: '/release [tag]', desc: 'generate release notes' },
        ],
      },
      {
        section: 'Agents & Skills',
        items: [
          { name: '/agents', desc: 'list loaded agents' },
          { name: '/agents create', desc: 'create new agent' },
          { name: '/skills', desc: 'list loaded skills' },
          { name: '/skills create', desc: 'create new skill' },
          { name: '/env', desc: 'list, activate, or inspect domain environment packs' },
        ],
      },
      {
        section: 'Project & Config',
        items: [
          { name: '/init', desc: 'analyze project & generate context file' },
          { name: '/project show', desc: 'display current project context' },
          { name: '/project edit', desc: 'open project context in editor' },
          { name: '/project-deep', desc: 'deep analysis + agent brief' },
          { name: '/model', desc: 'show current model' },
          { name: '/config', desc: 'show/edit configuration' },
        ],
      },
      {
        section: 'Tools & MCP',
        items: [
          { name: '/tools', desc: 'list available tools' },
          { name: '/mcp list', desc: 'list MCP servers' },
          { name: '/mcp tools', desc: 'list MCP tools' },
          { name: '/mcp add', desc: 'add MCP server' },
          { name: '/mcp help', desc: 'MCP setup guide' },
          { name: '/kanban', desc: 'open kanban task board' },
          { name: '/remote', desc: 'start remote web interface via ngrok' },
          { name: '/bridge', desc: 'open provider picker; Enter connects, Tab enables autostart, Stop bridge restores API-key runtime' },
          { name: '/bridge <provider>', desc: 'run Cast through an authenticated provider CLI without a Cast API key' },
          { name: '/bridge status', desc: 'show current bridge provider status, tools, and raw-output mode' },
          { name: '/bridge autostart <provider>|off', desc: 'persist or disable bridge autostart for this project' },
          { name: '/bridge stop', desc: 'disconnect bridge and return prompts to the normal Cast runtime' },
        ],
      },
      {
        section: 'Session & History',
        items: [
          { name: '/rollback [file]', desc: 'restore file from snapshot' },
          { name: '/stats', desc: 'show session token & cost stats' },
          { name: '/replay [list|save|show]', desc: 'save/view session replays' },
          { name: '/vault [list|show|promote]', desc: 'manage code snippet vault' },
        ],
      },
    ];

    return tool(
      async (input: { command?: string }) => {
        const query = input.command?.trim().toLowerCase().replace(/^\//, '');

        if (query) {
          if (query === 'bridge') {
            return [
              '**/bridge** - open a provider picker. Enter connects the selected CLI; Tab connects it and enables project autostart; Stop bridge restores the normal API-key runtime.',
              '**/bridge <provider>** - run Cast through an authenticated provider CLI.',
              `Providers: ${BRIDGE_PROVIDER_IDS.join(', ')}.`,
              'After /bridge <provider> connects, normal non-slash prompts are sent to that provider CLI until /bridge stop or Stop bridge in the picker.',
              'Use /bridge autostart <provider>|off to persist or disable project autostart in .cast/bridge.json.',
              'Use /bridge status, /bridge stop, /bridge reset, /bridge raw on|off, and /bridge tools for bridge control.',
              'Bridge is different from /remote: bridge swaps the model runtime; remote exposes the Cast UI over the web.',
              'Cast still owns local tools, permissions, transcripts, and file/shell guards.',
            ].join('\n');
          }

          for (const section of COMMANDS) {
            for (const item of section.items) {
              const itemName = item.name.toLowerCase().replace(/^\//, '').split(' ')[0];
              if (itemName === query || item.name.toLowerCase().includes(query)) {
                return `**${item.name}** — ${item.desc}\nSection: ${section.section}`;
              }
            }
          }
          return `Command "/${query}" not found. Use list_commands without arguments to see all available commands.`;
        }

        const sections = COMMANDS.map((s) => {
          const rows = s.items.map((i) => `- \`${i.name}\` — ${i.desc}`).join('\n');
          return `### ${s.section}\n${rows}`;
        });

        return `## REPL Commands\n\n${sections.join('\n\n')}\n\nUse cast_command(command: "/command args") to run a Cast slash command after explicit user permission. Do not run slash commands through shell.`;
      },
      {
        name: 'list_commands',
        description:
          'List available REPL slash commands (e.g. /commit, /pr, /review, /kanban, /bridge). Call this when the user mentions a /command or asks what commands are available in cast. Optionally pass a command name to get info about a specific one.',
        schema: z.object({
          command: z.string().optional().describe('Specific command to look up, e.g. "pr" or "/commit". Omit to list all.'),
        }),
      },
    );
  }

  private createCastCommandTool() {
    return tool(
      async (input: { command: string }) => {
        const command = String(input.command || '').trim();

        if (!command.startsWith('/')) {
          return 'Error: cast_command only accepts Cast slash commands, such as "/status" or "/up". Do not pass shell commands.';
        }

        if (/[\r\n]/.test(command)) {
          return 'Error: cast_command accepts exactly one slash command at a time.';
        }

        if (/^\/(?:exit|quit)\b/i.test(command)) {
          return 'Error: /exit and /quit cannot be run by the agent. The user must exit Cast directly.';
        }

        if (!this.castCommandHandler) {
          return 'Error: Cast command execution is not available in this context.';
        }

        try {
          return await this.castCommandHandler(command);
        } catch (error) {
          return `Error running Cast command: ${(error as Error).message}`;
        }
      },
      {
        name: 'cast_command',
        description:
          'Run a Cast REPL slash command such as /status, /diff, /up, /pr, /review, /agents, /skills, or /bridge. The host UI always asks the user for permission before executing. Use this instead of shell when the user mentions a Cast /command.',
        schema: z.object({
          command: z.string().describe('The Cast slash command to run, including arguments, e.g. "/up" or "/review src/app.ts".'),
        }),
      },
    );
  }

  private createAnalyzeImpactTool() {
    return tool(
      async (input: { file: string }) => {
        const result = this.impactAnalysisService.analyze(input.file);
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
