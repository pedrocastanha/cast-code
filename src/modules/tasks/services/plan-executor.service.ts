import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TaskManagementService } from './task-management.service';
import { PlanPersistenceService } from './plan-persistence.service';
import { PromptService } from '../../permissions/services/prompt.service';
import { Colors } from '../../repl/utils/theme';
import { Task, TaskStatus } from '../types/task.types';

@Injectable()
export class PlanExecutorService {
  private executing = false;
  private aborted = false;
  private currentPlanFile: string | null = null;
  private deepAgent: any = null;

  constructor(
    private taskService: TaskManagementService,
    private planPersistence: PlanPersistenceService,
    private promptService: PromptService,
    private moduleRef: ModuleRef,
  ) {}

  private async getDeepAgent() {
    if (!this.deepAgent) {
      const { DeepAgentService } = await import('../../core/services/deep-agent.service');
      this.deepAgent = this.moduleRef.get(DeepAgentService, { strict: false });
    }
    return this.deepAgent;
  }

  async executePlan(planId: string, autoApprove: boolean): Promise<void> {
    const plan = this.taskService.getPlans().get(planId);
    if (!plan) {
      throw new Error('Plan not found');
    }

    // Salvar plano
    this.currentPlanFile = await this.planPersistence.savePlan(plan, autoApprove);
    this.promptService.info(`📝 Plano salvo: ${this.currentPlanFile}`);
    console.log('');

    // Setup Ctrl+C handler
    const ctrlCHandler = () => {
      if (this.executing) {
        this.aborted = true;
        console.log(`\n${Colors.warning}⚠ Interrupção solicitada. Finalizando tarefa atual...${Colors.reset}\n`);
      }
    };
    process.on('SIGINT', ctrlCHandler);

    this.executing = true;
    plan.status = 'executing';

    const startTime = Date.now();
    const completedTasks: string[] = [];
    const errors: string[] = [];

    try {
      for (let i = 0; i < plan.tasks.length; i++) {
        if (this.aborted) {
          this.promptService.warning('Execução cancelada pelo usuário');
          break;
        }

        const task = plan.tasks[i];

        // Verificar dependências
        const depsSatisfied = task.dependencies.every(depId => {
          const dep = this.taskService.getTask(depId);
          return dep && dep.status === TaskStatus.COMPLETED;
        });

        if (!depsSatisfied) {
          errors.push(`Task ${task.id}: dependências não satisfeitas`);
          continue;
        }

        // Executar tarefa
        console.log(`${Colors.primary}►${Colors.reset} ${Colors.bold}Executando: ${task.subject}${Colors.reset}`);
        console.log(`  ${Colors.dim}${task.description}${Colors.reset}`);
        console.log('');

        this.taskService.updateTask(task.id, { status: TaskStatus.IN_PROGRESS, assignedAgent: 'main' });

        const deepAgent = await this.getDeepAgent();
        const result = await deepAgent.executeTask(task);

        if (!result.success) {
          errors.push(`Task ${task.id}: ${result.error || 'Falha na execução'}`);
          this.taskService.updateTask(task.id, { status: TaskStatus.FAILED });
        } else {
          this.taskService.updateTask(task.id, { status: TaskStatus.COMPLETED });
          completedTasks.push(task.id);
          console.log(`  ${Colors.success}✓ Concluído${Colors.reset}`);
        }

        // Atualizar progresso no arquivo
        await this.planPersistence.updatePlanProgress(this.currentPlanFile!, {
          currentTask: i + 1,
          completedTasks: completedTasks.length,
          status: 'executing',
        });

        console.log('');
      }

      // Marcar plano como completo
      plan.status = 'completed';
      const duration = Date.now() - startTime;

      await this.planPersistence.markPlanCompleted(this.currentPlanFile!, {
        success: errors.length === 0,
        duration,
        errors: errors.length > 0 ? errors : undefined,
      });

      console.log('');
      console.log('='.repeat(60));
      this.promptService.success(`✓ Plano concluído em ${(duration / 1000).toFixed(1)}s`);
      console.log(`  ${Colors.dim}${completedTasks.length}/${plan.tasks.length} tarefas completadas${Colors.reset}`);
      if (errors.length > 0) {
        console.log(`  ${Colors.warning}${errors.length} erros${Colors.reset}`);
      }
      console.log('='.repeat(60));
      console.log('');

    } finally {
      this.executing = false;
      this.aborted = false;
      this.currentPlanFile = null;
      this.taskService.clearExecutionContext();
      process.removeListener('SIGINT', ctrlCHandler);
    }
  }

  isExecuting(): boolean {
    return this.executing;
  }

  abort(): void {
    this.aborted = true;
  }
}
