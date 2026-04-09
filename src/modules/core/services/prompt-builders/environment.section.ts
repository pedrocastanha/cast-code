import { PromptSection, PromptBuilderContext } from './types';

export class EnvironmentSection implements PromptSection {
  id = 'environment';

  build(ctx: PromptBuilderContext): string {
    const parts = [
      '# Environment',
      `- Working directory: ${ctx.projectRoot}`,
      `- Platform: ${ctx.platform}`,
      `- Node.js: ${ctx.nodeVersion}`,
      '',
      '**IMPORTANT:** All file and shell operations MUST happen inside the working directory above.',
      'Do NOT create directories or files outside of it (e.g., do NOT use ~/some-new-folder or /home/user/new-project).',
      'When asked to scaffold a new project or feature, create it as a subdirectory of the working directory.',
      '',
    ];

    if (ctx.gitInfo) {
      parts.push('# Git Status (snapshot)', ctx.gitInfo, '');
    }

    if (ctx.contextPrompt) {
      parts.push(ctx.contextPrompt, '');
    }

    if (ctx.memoryPrompt) {
      parts.push(
        '# Auto Memory',
        'These are notes from previous sessions:',
        ctx.memoryPrompt,
        '',
      );
    }

    return parts.join('\n');
  }
}
