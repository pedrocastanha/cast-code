import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectAnalyzerService } from '../../../project/services/project-analyzer.service';
import { colorize } from '../../utils/theme';
import { CommandUiService } from '../command-ui.service';
import { confirmWithEsc } from '../../utils/prompts-with-esc';
import { ISmartInput } from '../smart-input';

@Injectable()
export class ProjectCommandsService {
  private readonly ui = new CommandUiService();

  constructor(
    private readonly projectAnalyzer: ProjectAnalyzerService,
  ) { }

  async cmdProject(args: string[], smartInput: ISmartInput): Promise<string | void> {
    const sub = args[0] || 'analyze';

    switch (sub) {
    case 'analyze':
    case 'generate':
      await this.generateContext(smartInput, false);
      break;

    case 'deep':
    case 'project-deep':
      return await this.generateContext(smartInput, true);

    case 'show':
      await this.showContext();
      return;

    case 'edit':
      await this.editContext();
      return;

    case 'help':
    default:
      this.printProjectHelp();
      return;
    }
  }

  private async generateContext(smartInput: ISmartInput, useAgent: boolean): Promise<string | void> {
    smartInput.pause();

    const w = (s: string) => process.stdout.write(s);

    w(this.ui.panel({
      title: 'Project Analysis',
      subtitle: useAgent ? 'deep mode' : 'quick mode',
      sections: [{ lines: [colorize('Scanning project files and generating Cast context.', 'muted')] }],
    }));

    const castDir = path.join(process.cwd(), '.cast');
    const contextPath = path.join(castDir, 'context.md');
    const agentInstructionsPath = path.join(castDir, 'agent-instructions.md');

    try {
      await fs.mkdir(castDir, { recursive: true });
    } catch { }

    w(`  ${colorize('Analyzing project structure...', 'info')}\r\n`);

    try {
      const context = await this.projectAnalyzer.analyze();

      w(colorize(`  ✓ Primary language: ${context.primaryLanguage}\r\n`, 'success'));
      if (context.languages.length > 1) {
        w(colorize(`  ✓ Other languages: ${context.languages.slice(1).join(', ')}\r\n`, 'success'));
      }
      if (context.architecture) {
        w(colorize(`  ✓ Architecture detected: ${context.architecture.pattern} (${context.architecture.confidence})\r\n`, 'success'));
      }
      w(colorize(`  ✓ ${context.modules.length} module(s) found\r\n`, 'success'));
      w(colorize(`  ✓ ${context.rawData.allFiles.length} code file(s)\r\n`, 'success'));

      const markdown = this.projectAnalyzer.generateMarkdown(context);
      await fs.writeFile(contextPath, markdown, 'utf-8');

      w(this.ui.success(`Basic context generated: ${contextPath}`));
      w(`  ${colorize('Cast will use this context in all conversations.', 'muted')}\r\n\r\n`);

      if (useAgent) {
        w(`  ${colorize('Generating instructions for deep analysis...', 'info')}\r\n\r\n`);

        const agentInstructions = this.projectAnalyzer.generateAgentInstructions(context);
        await fs.writeFile(agentInstructionsPath, agentInstructions, 'utf-8');

        w(this.ui.success(`Agent instructions generated: ${agentInstructionsPath}`));

        const mentionText = `@[${agentInstructionsPath}]`;
        w(`  ${colorize(`Starting agent with ${mentionText}...`, 'bold')}\r\n`);

        return mentionText;
      }

      const showPreview = await confirmWithEsc({
        message: 'Preview generated context?',
        default: true,
      });

      if (showPreview === true) {
        w('\r\n');
        const lines = markdown.split('\n').slice(0, 40);
        w(this.ui.panel({
          title: 'Context Preview',
          sections: [{ lines: lines.map((line) => line.length > 78 ? line.slice(0, 75) + '...' : line) }],
          footer: markdown.split('\n').length > 40 ? 'More content was written to .cast/context.md.' : undefined,
          width: 88,
        }));
        if (markdown.split('\n').length > 40) {
          w(colorize('  ... (more content in file)\r\n', 'muted'));
        }
      }

    } catch (error: any) {
      w(this.ui.error(`Error analyzing project: ${error.message}`));
    } finally {
      smartInput.resume();
    }
  }

  private async showContext(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const contextPath = path.join(process.cwd(), '.cast', 'context.md');

    try {
      const content = await fs.readFile(contextPath, 'utf-8');
      w(this.ui.panel({
        title: 'Project Context',
        subtitle: path.relative(process.cwd(), contextPath),
        sections: [{ lines: [colorize('Current .cast/context.md content:', 'muted')] }],
      }));
      w(content);
      w('\r\n');
    } catch {
      w(this.ui.warning('No context.md found. Use /project or /project analyze to generate one.'));
    }
  }

  private async editContext(): Promise<void> {
    const contextPath = path.join(process.cwd(), '.cast', 'context.md');

    const { spawn } = require('child_process');
    const editor = process.env.EDITOR || 'code';

    try {
      spawn(editor, [contextPath], {
        detached: true,
        stdio: 'ignore'
      }).unref();

      process.stdout.write(this.ui.success(`Opening ${contextPath} in editor...`));
    } catch {
      process.stdout.write(this.ui.error(`Could not open editor. File: ${contextPath}`));
    }
  }

  private printProjectHelp(): void {
    process.stdout.write(this.ui.panel({
      title: 'Project Context',
      subtitle: 'commands',
      sections: [
        {
          title: 'Commands',
          lines: [
            `${colorize('/project', 'cyan')}           ${colorize('quick project analysis', 'muted')}`,
            `${colorize('/project-deep', 'cyan')}      ${colorize('deep analysis with agent instructions', 'muted')}`,
            `${colorize('/project analyze', 'cyan')}   ${colorize('generate context.md', 'muted')}`,
            `${colorize('/project deep', 'cyan')}      ${colorize('context plus agent instructions', 'muted')}`,
            `${colorize('/project show', 'cyan')}      ${colorize('show current context', 'muted')}`,
            `${colorize('/project edit', 'cyan')}      ${colorize('open context in editor', 'muted')}`,
          ],
        },
        {
          title: 'Modes',
          lines: [
            `${colorize('Quick', 'accent')}  detects language, architecture, modules and dependencies`,
            `${colorize('Deep', 'accent')}   also generates a specialist agent brief for deeper analysis`,
          ],
        },
      ],
      footer: 'Supports TypeScript, JavaScript, Python, Go, Rust, Java, PHP, Ruby, and C#.',
    }));
  }
}
