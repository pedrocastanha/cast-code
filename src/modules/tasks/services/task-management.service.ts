import { Injectable } from '@nestjs/common';
import {
  Task,
  TaskStatus,
  TaskPlan,
  CreateTaskOptions,
  UpdateTaskOptions,
  PlanApprovalOptions,
  PlanExecutionContext,
} from '../types/task.types';
import { PromptService } from '../../permissions/services/prompt.service';
import { Colors } from '../../repl/utils/theme';


@Injectable()
export class TaskManagementService {
  private tasks: Map<string, Task> = new Map();
  private plans: Map<string, TaskPlan> = new Map();
  private taskCounter = 0;
  private planCounter = 0;
  private executionContext: PlanExecutionContext | null = null;

  constructor(private promptService: PromptService) {}

  createTask(options: CreateTaskOptions): Task {
    const id = `task-${++this.taskCounter}`;

    const task: Task = {
      id,
      subject: options.subject,
      description: options.description,
      activeForm: options.activeForm || this.generateActiveForm(options.subject),
      status: TaskStatus.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dependencies: options.dependencies || [],
      blocks: [],
      metadata: options.metadata || {},
    };

    this.tasks.set(id, task);

    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId);
      if (dep) {
        dep.blocks.push(id);
      }
    }

    return task;
  }

  updateTask(taskId: string, options: UpdateTaskOptions): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    if (options.status) task.status = options.status;
    if (options.subject) task.subject = options.subject;
    if (options.description) task.description = options.description;
    if (options.activeForm) task.activeForm = options.activeForm;

    if (options.addDependencies) {
      task.dependencies.push(...options.addDependencies);
    }

    if (options.removeDependencies) {
      task.dependencies = task.dependencies.filter(
        (id) => !options.removeDependencies?.includes(id),
      );
    }

    if (options.metadata) {
      task.metadata = { ...task.metadata, ...options.metadata };
    }

    task.updatedAt = Date.now();
    return task;
  }

  getTask(taskId: string): Task | null {
    return this.tasks.get(taskId) || null;
  }

  listTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  listPendingTasks(): Task[] {
    return this.listTasks().filter((task) => {
      if (task.status !== TaskStatus.PENDING) return false;

      return task.dependencies.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === TaskStatus.COMPLETED;
      });
    });
  }

  createPlan(title: string, description: string, tasks: CreateTaskOptions[]): TaskPlan {
    const id = `plan-${++this.planCounter}`;

    const createdTasks = tasks.map((taskOpt) => this.createTask(taskOpt));

    const plan: TaskPlan = {
      id,
      title,
      description,
      tasks: createdTasks,
      status: 'draft',
      createdAt: Date.now(),
    };

    this.plans.set(id, plan);
    return plan;
  }

  async approvePlan(planId: string): Promise<PlanApprovalOptions> {
    const plan = this.plans.get(planId);
    if (!plan) {
      this.promptService.error('Plan not found');
      return { approved: false, autoApprove: false };
    }

    // Renderizar plano
    console.log('\n' + '='.repeat(60));
    this.promptService.info(`📋 PLANO: ${plan.title}`);
    console.log('='.repeat(60));
    console.log('');
    console.log(plan.description);
    console.log('');
    console.log(`${Colors.bold}Tarefas (${plan.tasks.length}):${Colors.reset}`);
    console.log('');

    plan.tasks.forEach((task, index) => {
      const depInfo =
        task.dependencies.length > 0
          ? ` ${Colors.muted}(depende de: ${task.dependencies.join(', ')})${Colors.reset}`
          : '';
      console.log(`  ${Colors.primary}${index + 1}.${Colors.reset} ${Colors.bold}${task.subject}${Colors.reset}${depInfo}`);
      console.log(`     ${Colors.dim}${task.description}${Colors.reset}`);
      console.log('');
    });

    console.log('='.repeat(60));
    console.log('');

    // Opções aprimoradas
    const choices = [
      {
        key: 'approve',
        label: '1 - Sim',
        description: 'Executar o plano'
      },
      {
        key: 'auto-approve',
        label: '2 - Sim com auto-approve',
        description: 'Executar sem pedir aprovação em cada etapa'
      },
      {
        key: 'modify',
        label: '4 - Digite algo',
        description: 'Modificar o plano antes de executar'
      },
      {
        key: 'cancel',
        label: '3 - Não',
        description: 'Cancelar e não executar'
      },
    ];

    const choice = await this.promptService.choice('O que você deseja fazer?', choices);

    switch (choice) {
      case 'approve':
        plan.status = 'approved';
        this.promptService.success('✓ Plano aprovado! Iniciando execução...');
        return { approved: true, autoApprove: false };

      case 'auto-approve':
        plan.status = 'approved';
        this.promptService.success('✓ Plano aprovado com auto-approve! Execução automática ativada.');
        return { approved: true, autoApprove: true };

      case 'modify':
        const modification = await this.promptService.question(
          `${Colors.accent}Como deseja modificar o plano?${Colors.reset}`
        );
        plan.status = 'draft';
        return {
          approved: false,
          autoApprove: false,
          modificationRequested: modification
        };

      case 'cancel':
        plan.status = 'cancelled';
        this.promptService.info('Plano cancelado');
        return { approved: false, autoApprove: false };

      default:
        return { approved: false, autoApprove: false };
    }
  }

  async executePlan(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error('Plan not found');
    }

    if (plan.status !== 'approved') {
      throw new Error('Plan must be approved before execution');
    }

    plan.status = 'executing';
    this.promptService.info('Starting plan execution...');
  }

  private generateActiveForm(subject: string): string {
    const firstWord = subject.split(' ')[0].toLowerCase();
    const rest = subject.slice(firstWord.length);

    const gerundMap: Record<string, string> = {
      create: 'Creating',
      add: 'Adding',
      implement: 'Implementing',
      fix: 'Fixing',
      update: 'Updating',
      remove: 'Removing',
      delete: 'Deleting',
      refactor: 'Refactoring',
      test: 'Testing',
      write: 'Writing',
      read: 'Reading',
    };

    const gerund = gerundMap[firstWord] || subject + 'ing';
    return gerund + rest;
  }

  clearCompletedTasks(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
        this.tasks.delete(id);
      }
    }
  }

  setExecutionContext(context: PlanExecutionContext): void {
    this.executionContext = context;
  }

  getExecutionContext(): PlanExecutionContext | null {
    return this.executionContext;
  }

  clearExecutionContext(): void {
    this.executionContext = null;
  }

  isAutoApproveActive(): boolean {
    return this.executionContext?.autoApprove ?? false;
  }

  getPlans(): Map<string, TaskPlan> {
    return this.plans;
  }
}
