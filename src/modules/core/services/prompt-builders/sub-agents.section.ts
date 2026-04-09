import { PromptSection, PromptBuilderContext } from './types';

export class SubAgentsSection implements PromptSection {
  id = 'sub-agents';

  build(ctx: PromptBuilderContext): string {
    if (ctx.subagents.length === 0) return '';

    const parts: string[] = [
      '# Sub-Agent Orchestration',
      '',
      `You have ${ctx.subagents.length} specialized sub-agents available. Each has domain-specific knowledge and tools.`,
      'Use list_agents for a full interactive listing at any time.',
      '',
      '## Available Sub-Agents',
      '',
    ];

    for (const sa of ctx.subagents) {
      const mcpNote = sa.mcp && sa.mcp.length > 0 ? `\n**MCP access:** ${sa.mcp.join(', ')}` : '';
      const bullets: string[] = [];
      if (sa.systemPrompt) {
        for (const line of sa.systemPrompt.split('\n')) {
          if (bullets.length >= 3) break;
          const m = line.trim().match(/^(?:[-*]|\d+\.)\s+(.+)/);
          if (m && m[1]) {
            const text = m[1].trim();
            if (text.length > 0) bullets.push(text.length > 80 ? text.slice(0, 77) + '...' : text);
          }
        }
      }
      const specializes = bullets.length > 0
        ? bullets.map((b) => `  - ${b}`).join('\n')
        : `  (see list_agents for details)`;
      parts.push(
        `### ${sa.name}`,
        `**Role:** ${sa.description}${mcpNote}`,
        `**Specializes in:**`,
        specializes,
        `**Dispatch in background:**`,
        `  → delegate to agent: "${sa.name}" with a focused task description`,
        `  → include all necessary context in the task`,
        `  → track with task_create before dispatching`,
        ``,
      );
    }

    parts.push(
      '## When to Delegate to Sub-Agents',
      '- Task requires specialized domain knowledge (React, testing, API design, databases)',
      '- Multiple independent subtasks can be worked on in parallel',
      '- Task is well-defined and self-contained (a sub-agent can complete it without further guidance)',
      '- You want a focused review or analysis (e.g., code review, architecture review)',
      '',
      '## When NOT to Delegate',
      '- Simple tasks you can do yourself quickly',
      '- Tasks that require back-and-forth with the user',
      '- Tasks that depend heavily on earlier context in this conversation',
      '',
      '## Delegation Pattern',
      '1. Identify the task and which sub-agent is best suited',
      '2. Create a clear,specific task description with all necessary context',
      '3. Delegate execution to that sub-agent (do not stop at planning only)',
      '4. Track delegated work with task_create/task_update',
      '5. When the sub-agent returns, verify the result and integrate it',
      '6. Mark the task as completed',
      '',
      '## Delegation Quality Bar',
      '- If user explicitly asks to use a specific sub-agent, you MUST delegate to it',
      '- For frontend UI generation from Figma, prefer the frontend sub-agent when available',
      '- Avoid fake delegation: creating tasks without executing delegated work is not enough',
      '- Return concrete delegated outputs (files changed, decisions made, validations run)',
      '',
      '## Multi-Agent Coordination',
      'For large tasks, you can orchestrate multiple sub-agents:',
      '1. Break the work into independent pieces',
      '2. Assign each piece to the most qualified sub-agent',
      '3. Track progress with task_create/task_update',
      '4. Integrate results and verify the combined output',
      '',
      '## MCP-Aware Delegation',
      'When a task involves heavy interaction with an external service (e.g., fetching Figma designs, managing GitHub issues):',
      '- Check which sub-agents have MCP access (shown in [MCP access] above)',
      '- Delegate MCP-heavy work to the sub-agent with the right MCP connection',
      '- If no sub-agent has the needed MCP, handle it yourself using the MCP tools directly',
      '- Include the MCP server name in the task description so the sub-agent knows which tools to use',
      '',
    );

    return parts.join('\n');
  }
}
