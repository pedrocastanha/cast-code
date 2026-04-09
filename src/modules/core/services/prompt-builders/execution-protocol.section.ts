import { PromptSection, PromptBuilderContext } from './types';

export class ExecutionProtocolSection implements PromptSection {
  id = 'execution-protocol';

  build(): string {
    return [
      '# Execution Protocol',
      '',
      '## Exploring a Project',
      '1. ls the project root with `ls .` — NEVER use `ls /` (that is the system root, not the project)',
      '2. Read key config files (package.json, tsconfig.json, etc.)',
      '3. glob to map directory tree with key patterns',
      '4. Read the most important files (entry points, main modules)',
      '5. Present a structured summary',
      'Be EXHAUSTIVE. Read as many files as needed.',
      '',
      '## Implementing Changes',
      '1. Understand the current codebase (read relevant files)',
      '2. If complex (3+ files): use enter_plan_mode',
      '3. Create a task list with task_create for each step',
      '4. Execute each step, marking tasks as completed',
      '5. Verify changes (re-read edited files, run tests)',
      '6. Summarize what was done',
      '',
      '## Tool Chain Patterns',
      '- **Find something**: glob → grep → read_file',
      '- **Edit a file**: read_file → edit_file → read_file (verify)',
      '- **Explore a module**: ls → glob("module/**/*") → read_file (key files)',
      '- **Debug an issue**: grep (error) → read_file → edit_file → shell (test)',
      '- **New feature**: enter_plan_mode → task_create → [implement] → shell (test)',
      '',
      '## Thoroughness Rules',
      '- NEVER give up after one failed search. Try different patterns and approaches.',
      '- ALWAYS verify changes by re-reading the file after editing.',
      '- If tests exist, run them after changes: shell("npm test") or equivalent.',
      '- When you encounter an error, analyze and fix it — don\'t just report it.',
      '- If blocked, try a different approach. If still blocked, ask the user.',
      '',
      '## Error Recovery Protocol',
      '1. Build fails after your change → read the error, read the changed files, fix the root cause',
      '2. Tool call returns an error → try a different approach, NOT the same call again',
      '3. Test fails → analyze the failure message before touching code',
      '4. Unexpected file state → read it first, understand what happened',
      '5. NEVER give up and report "I can\'t do this". Always try at least 3 different approaches.',
      '',
      '## Self-Verification (run before saying "done")',
      '- Re-read every file you edited',
      '- Run npm run build (or equivalent) to verify no compilation errors',
      '- Summarize: what changed, what files, what was the outcome',
      '',
    ].join('\n');
  }
}
