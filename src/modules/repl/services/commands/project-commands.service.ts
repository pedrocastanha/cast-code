import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectAnalyzerService, ProjectContext } from '../../../project/services/project-analyzer.service';
import { Colors, colorize, Box, Icons } from '../../utils/theme';
import { confirmWithEsc } from '../../utils/prompts-with-esc';

interface SmartInput {
  askChoice: (question: string, choices: { key: string; label: string; description: string }[]) => Promise<string>;
  question: (prompt: string) => Promise<string>;
}

@Injectable()
export class ProjectCommandsService {
  constructor(
    private readonly projectAnalyzer: ProjectAnalyzerService,
  ) {}

  async cmdProject(args: string[], smartInput: SmartInput): Promise<void> {
    const sub = args[0] || 'analyze';
    
    switch (sub) {
      case 'analyze':
      case 'generate':
        await this.generateContext(smartInput, false);
        break;

      case 'deep':
      case 'project-deep':
        await this.generateContext(smartInput, true);
        break;

      case 'show':
        await this.showContext();
        break;

      case 'edit':
        await this.editContext();
        break;

      case 'help':
      default:
        this.printProjectHelp();
        break;
    }
  }

  private async generateContext(smartInput: SmartInput, useAgent: boolean): Promise<void> {
    smartInput.pause();
    
    const w = (s: string) => process.stdout.write(s);
    
    w('\r\n');
    w(colorize(Icons.folder + ' ', 'accent') + colorize('Análise de Projeto', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    const castDir = path.join(process.cwd(), '.cast');
    const contextPath = path.join(castDir, 'context.md');
    const agentInstructionsPath = path.join(castDir, 'agent-instructions.md');

    try {
      await fs.mkdir(castDir, { recursive: true });
    } catch {}

    w(colorize('  🔍 Analisando estrutura do projeto...\r\n', 'info'));

    try {
      const context = await this.projectAnalyzer.analyze();
      
      w(colorize(`  ✓ Linguagem principal: ${context.primaryLanguage}\r\n`, 'success'));
      if (context.languages.length > 1) {
        w(colorize(`  ✓ Outras linguagens: ${context.languages.slice(1).join(', ')}\r\n`, 'success'));
      }
      if (context.architecture) {
        w(colorize(`  ✓ Arquitetura detectada: ${context.architecture.pattern} (${context.architecture.confidence})\r\n`, 'success'));
      }
      w(colorize(`  ✓ ${context.modules.length} módulo(s) encontrado(s)\r\n`, 'success'));
      w(colorize(`  ✓ ${context.rawData.allFiles.length} arquivo(s) de código\r\n`, 'success'));

      const markdown = this.projectAnalyzer.generateMarkdown(context);
      await fs.writeFile(contextPath, markdown, 'utf-8');

      w(`\r\n${colorize('✓', 'success')} Contexto básico gerado: ${colorize(contextPath, 'accent')}\r\n`);
      w(colorize('  O Cast usará este contexto em todas as conversas!\r\n\r\n', 'muted'));

      if (useAgent) {
        w(colorize('  🤖 Gerando instruções para análise profunda...\r\n\r\n', 'info'));
        
        const agentInstructions = this.projectAnalyzer.generateAgentInstructions(context);
        await fs.writeFile(agentInstructionsPath, agentInstructions, 'utf-8');
        
        w(`${colorize('✓', 'success')} Instruções para agente: ${colorize(agentInstructionsPath, 'accent')}\r\n\r\n`);
        
        w(colorize('📋 Para análise profunda, você pode:\r\n', 'bold'));
        w(colorize('  1. Copiar as instruções de ' + agentInstructionsPath + '\r\n', 'muted'));
        w(colorize('  2. Colar em uma nova conversa com um agente especialista\r\n', 'muted'));
        w(colorize('  3. O agente analisará profundamente o projeto\r\n\r\n', 'muted'));
      }

      const showPreview = await confirmWithEsc({
        message: 'Deseja ver um preview do contexto gerado?',
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
          w(colorize('  ... (mais conteúdo no arquivo)\r\n', 'muted'));
        }
        w(colorize('─'.repeat(60), 'subtle') + '\r\n\r\n');
      }

    } catch (error: any) {
      w(`\r\n${colorize('✗', 'error')} Erro ao analisar projeto: ${error.message}\r\n\r\n`);
    } finally {
      smartInput.resume();
    }
  }

  private async showContext(): Promise<void> {
    const w = (s: string) => process.stdout.write(s);
    const contextPath = path.join(process.cwd(), '.cast', 'context.md');

    w('\r\n');
    w(colorize(Icons.file + ' ', 'accent') + colorize('Contexto do Projeto', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(30), 'subtle') + '\r\n\r\n');

    try {
      const content = await fs.readFile(contextPath, 'utf-8');
      w(content);
      w('\r\n');
    } catch {
      w(colorize('  ⚠️  Nenhum context.md encontrado!\r\n', 'warning'));
      w(colorize('  Use "/project" ou "/project analyze" para gerar.\r\n\r\n', 'muted'));
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
      
      console.log(`\r\n  ${colorize('✓', 'success')} Abrindo ${contextPath} no editor...\r\n`);
    } catch {
      console.log(`\r\n  ${colorize('✗', 'error')} Não foi possível abrir o editor.\r\n`);
      console.log(`  ${colorize('Arquivo:', 'muted')} ${contextPath}\r\n\r\n`);
    }
  }

  private printProjectHelp(): void {
    const w = (s: string) => process.stdout.write(s);

    w('\r\n');
    w(colorize(Icons.folder + ' ', 'accent') + colorize('Project Context Commands', 'bold') + '\r\n');
    w(colorize(Box.horizontal.repeat(35), 'subtle') + '\r\n\r\n');

    w(colorize('Comandos:', 'bold') + '\r\n');
    w(`  ${colorize('/project', 'cyan')}           → Análise rápida do projeto\r\n`);
    w(`  ${colorize('/project-deep', 'cyan')}      → Análise profunda (gera instruções para agente)\r\n`);
    w(`  ${colorize('/project analyze', 'cyan')}    → Gera context.md (mesmo que /project)\r\n`);
    w(`  ${colorize('/project deep', 'cyan')}       → Análise + instruções para agente\r\n`);
    w(`  ${colorize('/project show', 'cyan')}       → Mostra o contexto atual\r\n`);
    w(`  ${colorize('/project edit', 'cyan')}       → Abre no editor\r\n\r\n`);

    w(colorize('Modo Rápido vs Profundo:', 'bold') + '\r\n\r\n');
    
    w(colorize('⚡ Modo Rápido (/project):', 'accent') + '\r\n');
    w(`  • Detecta linguagem (TypeScript, Python, Go, Rust, Java, etc.)\r\n`);
    w(`  • Identifica arquitetura (MVC, Clean, Hexagonal, DDD, etc.)\r\n`);
    w(`  • Lista módulos e suas responsabilidades\r\n`);
    w(`  • Extrai dependências principais\r\n`);
    w(`  • Funciona com QUALQUER linguagem/framework\r\n\r\n`);
    
    w(colorize('🤖 Modo Profundo (/project-deep):', 'accent') + '\r\n');
    w(`  • Faz tudo do modo rápido\r\n`);
    w(`  • Gera instruções para um agente especialista\r\n`);
    w(`  • O agente pode analisar fluxos de dados completos\r\n`);
    w(`  • Documenta casos de uso e regras de negócio\r\n`);
    w(`  • Identifica débito técnico\r\n\r\n`);

    w(colorize('Suporte a Linguagens:', 'bold') + '\r\n');
    w(`  TypeScript/JavaScript, Python, Go, Rust, Java, PHP, Ruby, C#\r\n\r\n`);
  }
}
