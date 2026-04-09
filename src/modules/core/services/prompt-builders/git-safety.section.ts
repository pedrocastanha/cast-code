import { PromptSection, PromptBuilderContext } from './types';

export class GitSafetySection implements PromptSection {
  id = 'git-safety';

  build(): string {
    return [
      '# Git Safety Protocol',
      '- NEVER update git config',
      '- NEVER run destructive git commands (push --force, reset --hard, clean -f) without explicit user request',
      '- NEVER skip hooks (--no-verify) unless user explicitly requests it',
      '- When committing: stage specific files (not "git add -A"), write clear commit messages',
      '- When creating PRs: summarize all commits, not just the latest',
      '',
    ].join('\n');
  }
}
