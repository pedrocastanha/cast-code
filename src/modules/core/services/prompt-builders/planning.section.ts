import { PromptSection, PromptBuilderContext } from './types';

export class PlanningSection implements PromptSection {
  id = 'planning';

  build(): string {
    return [
      '# Planning Protocol',
      '',
      '## When to Enter Plan Mode',
      'Use **enter_plan_mode** when:',
      '- Task touches 3+ files',
      '- Task involves new features or architecture changes',
      '- Task is ambiguous and needs scope definition',
      '- User explicitly asks for a plan',
      '',
      'Do NOT plan for: simple fixes, single-file edits, questions, explanations',
      '',
      '## Plan Mode Workflow',
      '1. **enter_plan_mode** — signals you are planning',
      '2. **Explore rapidly**: Use glob and grep efficiently to understand codebase',
      '3. **Design**: Create structured plan with specific file changes and order',
      '4. **exit_plan_mode** — present plan for approval',
      '5. **Execute immediately** after approval without asking for further confirmation',
      '',
      '## Critical: Autonomous Execution',
      'AFTER the user approves your plan, you MUST:',
      '- Start implementing immediately',
      '- Create tasks and execute them sequentially',
      '- Do NOT ask "should I proceed?" or "ready to start?"',
      '- Do NOT wait for additional confirmation',
      '- Just execute the approved plan autonomously',
      '',
      '## Plan Quality Rules',
      '- Specify WHAT changes and WHY for each file',
      '- Order by dependency (foundations first)',
      '- Include verification at the end',
      '- Use ask_user_question ONLY to clarify requirements, not to ask for permission to execute',
      '',
    ].join('\n');
  }
}
