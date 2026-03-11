import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectAnalyzerService, ProjectContext } from '../../../project/services/project-analyzer.service';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { confirmWithEsc } from '../../utils/prompts-with-esc';
import { ISmartInput } from '../smart-input';

@Injectable()
export class ProjectCommandsService {
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

    w('\r\n');
    w(colorize(Icons.folder + ' ', 'accent') + colorize('Project Analysis', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    const castDir = path.join(process.cwd(), '.cast');
    const contextPath = path.join(castDir, 'context.md');
    const agentInstructionsPath = path.join(castDir, 'agent-instructions.md');

    try {
      await fs.mkdir(castDir, { recursive: true });
    } catch { }

    w(colorize('  🔍 Analyzing project structure...\r\n', 'info'));

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

      w(`\r\n${colorize('✓', 'success')} Basic context generated: ${colorize(contextPath, 'accent')}\r\n`);
      w(colorize('  Cast will use this context in all conversations!\r\n\r\n', 'muted'));

      if (useAgent) {
        w(colorize('  🤖 Generating instructions for deep analysis...\r\n\r\n', 'info'));

        const agentInstructions = this.projectAnalyzer.generateAgentInstructions(context);
        await fs.writeFile(agentInstructionsPath, agentInstructions, 'utf-8');

        w(`${colorize('✓', 'success')} Agent instructions: ${colorize(agentInstructionsPath, 'accent')}\r\n\r\n`);

        const mentionText = `@[${agentInstructionsPath}]`;
        w(colorize(`  Starting agent with ${mentionText}...\r\n`, 'bold'));

        return mentionText;
      }

      const showPreview = await confirmWithEsc({
        message: 'Preview generated context?',
        default: true,
      });

      if (showPreview === true) {
        w('\r\n');
        w(colorize('─'.repeat(60), 'subtle') + '\r\n');
        const lines = markdown.split('\n').slice(0, 40);
        lines.forEach(line => {
          const truncated = line.length > 78 ? line.slice(0, 75) + '...' : line;
          w('  ' + truncated + '\r\n');
        });
        if (markdown.split('\n').length > 40) {
          w(colorize('  ... (more content in file)\r\n', 'muted'));
        }
        w(colorize('─'.repeat(60), 'subtle') + '\r\n\r\n');
      }

    } catch (error: any) {
      w(`\r\n${colorize('✗', 'error')} Error analyzing project: ${error.message}\r\n\r\n`);
    } finally {
      smartInput.resume();
    }
  }

  private async showContext(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const contextPath = path.join(process.cwd(), '.cast', 'context.md');

    w('\r\n');
    w(colorize(Icons.file + ' ', 'accent') + colorize('Project Context', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    try {
      const content = await fs.readFile(contextPath, 'utf-8');
      w(content);
      w('\r\n');
    } catch {
      w(colorize('  ⚠️  No context.md found!\r\n', 'warning'));
      w(colorize('  Use "/project" or "/project analyze" to generate one.\r\n\r\n', 'muted'));
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

      console.log(`\r\n  ${colorize('✓', 'success')} Opening ${contextPath} in editor...\r\n`);
    } catch {
      console.log(`\r\n  ${colorize('✗', 'error')} Could not open editor.\r\n`);
      console.log(`  ${colorize('File:', 'muted')} ${contextPath}\r\n\r\n`);
    }
  }

  private printProjectHelp(): void {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(colorize(Icons.folder + ' ', 'accent') + colorize('Project Context Commands', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(35), 'subtle') + '\r\n\r\n');

    w(colorize('Commands:', 'bold') + '\r\n');
    w(`  ${colorize('/project', 'cyan')}           → Quick project analysis\r\n`);
    w(`  ${colorize('/project-deep', 'cyan')}      → Deep analysis (generates agent instructions)\r\n`);
    w(`  ${colorize('/project analyze', 'cyan')}    → Generate context.md (same as /project)\r\n`);
    w(`  ${colorize('/project deep', 'cyan')}       → Analysis + agent instructions\r\n`);
    w(`  ${colorize('/project show', 'cyan')}       → Show current context\r\n`);
    w(`  ${colorize('/project edit', 'cyan')}       → Open in editor\r\n\r\n`);

    w(colorize('Quick vs Deep Mode:', 'bold') + '\r\n\r\n');

    w(colorize('⚡ Quick Mode (/project):', 'accent') + '\r\n');
    w(`  • Detects language (TypeScript, Python, Go, Rust, Java, etc.)\r\n`);
    w(`  • Identifies architecture (MVC, Clean, Hexagonal, DDD, etc.)\r\n`);
    w(`  • Lists modules and their responsibilities\r\n`);
    w(`  • Extracts main dependencies\r\n`);
    w(`  • Works with ANY language/framework\r\n\r\n`);

    w(colorize('🤖 Deep Mode (/project-deep):', 'accent') + '\r\n');
    w(`  • Does everything from quick mode\r\n`);
    w(`  • Generates instructions for a specialist agent\r\n`);
    w(`  • Agent can analyze complete data flows\r\n`);
    w(`  • Documents use cases and business rules\r\n`);
    w(`  • Identifies technical debt\r\n\r\n`);

    w(colorize('Language Support:', 'bold') + '\r\n');
    w(`  TypeScript/JavaScript, Python, Go, Rust, Java, PHP, Ruby, C#\r\n\r\n`);
  }
}
