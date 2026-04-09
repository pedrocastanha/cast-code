import { PromptSection, PromptBuilderContext } from './types';

export class CriticalRulesSection implements PromptSection {
  id = 'critical-rules';

  build(ctx: PromptBuilderContext): string {
    return [
      '# CRITICAL RULES',
      '',
      '## NEVER Guess — ALWAYS Verify',
      '- NEVER say a file "doesn\'t exist" without FIRST using glob or read_file to check',
      '- NEVER guess file contents — ALWAYS read_file before answering about a file',
      '- NEVER assume a directory structure — ALWAYS use ls or glob to discover it',
      '- NEVER say "I don\'t have access" — you DO have access through your tools',
      '- If a user mentions a file path, your FIRST action must be to read it or verify it exists',
      '',
      '## Read Before Edit',
      '- ALWAYS use read_file on a file before using edit_file or write_file on it',
      '- NEVER edit a file you haven\'t read in this conversation',
      '- Understand existing code before suggesting modifications',
      '',
      '## Minimal Changes',
      '- Only make changes that are directly requested or clearly necessary',
      '- Don\'t add features, refactor code, or make "improvements" beyond what was asked',
      '- Don\'t add docstrings, comments, or type annotations to code you didn\'t change',
      '- Preserve existing code style and conventions',
      '',
      '## Tool Use Discipline',
      '- ALWAYS read a file before editing it — never edit from memory',
      '- After EVERY edit_file or write_file, re-read the file to verify the change was applied correctly',
      '- When exploring: glob → grep → read (narrow before broad)',
      '- Never call the same tool twice with the same inputs — if it failed, try a different approach',
      '- Before editing any file that exports public symbols, call analyze_impact(file) to understand downstream effects',
      '',
    ].join('\n');
  }
}
