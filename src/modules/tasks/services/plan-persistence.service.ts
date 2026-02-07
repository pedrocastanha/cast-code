import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TaskPlan, Task } from '../types/task.types';

@Injectable()
export class PlanPersistenceService {
  private plansDir: string;

  constructor() {
    this.plansDir = path.join(process.cwd(), '.cast', 'plans');
    this.ensurePlansDir();
  }

  private ensurePlansDir(): void {
    if (!fs.existsSync(this.plansDir)) {
      fs.mkdirSync(this.plansDir, { recursive: true });
    }
  }

  generateFilename(plan: TaskPlan): string {
    const date = new Date(plan.createdAt);
    const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = plan.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 50);
    return `${timestamp}-${safeName}.md`;
  }

  async savePlan(plan: TaskPlan, autoApprove: boolean): Promise<string> {
    const filename = this.generateFilename(plan);
    const filepath = path.join(this.plansDir, filename);

    const content = this.formatPlanAsMarkdown(plan, autoApprove);

    fs.writeFileSync(filepath, content, 'utf-8');

    return filepath;
  }

  async updatePlanProgress(filepath: string, progress: {
    currentTask: number;
    completedTasks: number;
    status: string;
  }): Promise<void> {
    let content = fs.readFileSync(filepath, 'utf-8');

    // Atualizar seção de progresso
    const progressSection = `## Progresso\n\nTarefa atual: ${progress.currentTask}\nTarefas completadas: ${progress.completedTasks}\nStatus: ${progress.status}\n`;

    if (content.includes('## Progresso')) {
      content = content.replace(/## Progresso[\s\S]*?(?=\n##|$)/, progressSection);
    } else {
      content += '\n' + progressSection;
    }

    fs.writeFileSync(filepath, content, 'utf-8');
  }

  async markPlanCompleted(filepath: string, result: {
    success: boolean;
    duration: number;
    errors?: string[];
  }): Promise<void> {
    let content = fs.readFileSync(filepath, 'utf-8');

    const resultSection = `\n## Resultado\n\n${result.success ? '✓' : '✗'} ${result.success ? 'Concluído com sucesso' : 'Concluído com erros'}\nDuração: ${(result.duration / 1000).toFixed(1)}s\n${result.errors ? `\nErros:\n${result.errors.map(e => `- ${e}`).join('\n')}` : ''}\n`;

    content += resultSection;

    fs.writeFileSync(filepath, content, 'utf-8');
  }

  private formatPlanAsMarkdown(plan: TaskPlan, autoApprove: boolean): string {
    const lines: string[] = [];

    lines.push('---');
    lines.push(`id: ${plan.id}`);
    lines.push(`title: "${plan.title}"`);
    lines.push(`status: ${plan.status}`);
    lines.push(`created: ${new Date(plan.createdAt).toISOString()}`);
    lines.push(`auto_approve: ${autoApprove}`);
    lines.push('---');
    lines.push('');
    lines.push(`# ${plan.title}`);
    lines.push('');
    lines.push('## Descrição');
    lines.push('');
    lines.push(plan.description);
    lines.push('');
    lines.push('## Tarefas');
    lines.push('');

    plan.tasks.forEach((task, index) => {
      lines.push(`### ${index + 1}. ${task.subject}`);
      lines.push('');
      lines.push(`**Status:** ${task.status}`);

      if (task.dependencies.length > 0) {
        lines.push(`**Dependências:** ${task.dependencies.join(', ')}`);
      }

      lines.push('');
      lines.push(task.description);
      lines.push('');
    });

    lines.push('## Progresso');
    lines.push('');
    lines.push('_O progresso será atualizado durante a execução_');
    lines.push('');

    return lines.join('\n');
  }
}
