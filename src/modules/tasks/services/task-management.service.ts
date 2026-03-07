import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
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
  readonly events = new EventEmitter();
  private tasks: Map<string, Task> = new Map();
  private plans: Map<string, TaskPlan> = new Map();
  private taskCounter = 0;
  private planCounter = 0;
  private executionContext: PlanExecutionContext | null = null;

  constructor(private promptService: PromptService) { }

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

    this.events.emit('task:created', task);
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

    if (options.assignedAgent !== undefined) task.assignedAgent = options.assignedAgent;

    if (options.metadata) {
      task.metadata = { ...task.metadata, ...options.metadata };
    }

    task.updatedAt = Date.now();
    this.events.emit('task:updated', task);

    // Debug log for Kanban updates
    if (options.status) {
      process.stdout.write(`\r  Task ${taskId} status updated to: ${options.status}\n`);
    }

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
    this.events.emit('plan:created', plan);
    return plan;
  }

  async approvePlan(planId: string): Promise<PlanApprovalOptions> {
    const plan = this.plans.get(planId);
    if (!plan) {
      this.promptService.error('Plan not found');
      return { approved: false, autoApprove: false };
    }

    // Renderizar plano
    console.log(`\n${Colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Colors.reset}`);
    this.promptService.info(`${Colors.bold}📋 PLAN: ${plan.title}${Colors.reset}`);
    console.log(`${Colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Colors.reset}`);
    console.log('');
    console.log(plan.description);
    console.log('');
    console.log(`${Colors.bold}Tasks (${plan.tasks.length}):${Colors.reset}`);
    console.log('');

    plan.tasks.forEach((task, index) => {
      const depInfo =
        task.dependencies.length > 0
          ? ` ${Colors.muted}(depends on: ${task.dependencies.join(', ')})${Colors.reset}`
          : '';
      console.log(`  ${Colors.primary}${index + 1}.${Colors.reset} ${Colors.bold}${task.subject}${Colors.reset}${depInfo}`);
      console.log(`     ${Colors.dim}${task.description}${Colors.reset}`);
      console.log('');
    });

    console.log(`${Colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Colors.reset}`);
    console.log('');

    // Opções aprimoradas
    const choices = [
      {
        key: 'approve',
        label: 'Approve',
        description: 'Execute the plan'
      },
      {
        key: 'auto-approve',
        label: 'Auto-approve',
        description: 'Execute without asking for approval on each step'
      },
      {
        key: 'modify',
        label: 'Modify',
        description: 'Modify the plan before executing'
      },
      {
        key: 'cancel',
        label: 'Cancel',
        description: 'Cancel and do not execute'
      },
    ];

    const choice = await this.promptService.choice('What do you want to do?', choices);

    switch (choice) {
      case 'approve':
        plan.status = 'approved';
        this.promptService.success('✓ Plan approved! Starting execution...');
        return { approved: true, autoApprove: false };

      case 'auto-approve':
        plan.status = 'approved';
        this.promptService.success('✓ Plan approved with auto-approve! Automatic execution enabled.');
        return { approved: true, autoApprove: true };

      case 'modify':
        const modification = await this.promptService.question(
          `${Colors.accent}How do you want to modify the plan?${Colors.reset}`
        );
        plan.status = 'draft';
        return {
          approved: false,
          autoApprove: false,
          modificationRequested: modification
        };

      case 'cancel':
        plan.status = 'cancelled';
        this.promptService.info('Plan cancelled');
        return { approved: false, autoApprove: false };

      default:
        return { approved: false, autoApprove: false };
    }
  }

  private generateActiveForm(subject: string): string {
    const firstWord = subject.split(' ')[0].toLowerCase();
    const rest = subject.slice(firstWord.length);

    const gerundMap: Record<string, string> = {
      // English
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
      // Portuguese
      criar: 'Criando',
      adicionar: 'Adicionando',
      implementar: 'Implementando',
      corrigir: 'Corrigindo',
      atualizar: 'Atualizando',
      remover: 'Removendo',
      deletar: 'Deletando',
      refatorar: 'Refatorando',
      testar: 'Testando',
      escrever: 'Escrevendo',
      ler: 'Lendo',
      analisar: 'Analisando',
      fazer: 'Fazendo',
      crie: 'Criando',
      adicione: 'Adicionando',
      implemente: 'Implementando',
      corrija: 'Corrigindo',
      atualize: 'Atualizando',
      remova: 'Removendo',
      analise: 'Analisando',
      faça: 'Fazendo',
    };

    const gerund = gerundMap[firstWord] || (subject.length > 20 ? subject.slice(0, 20) + '...' : subject);
    return gerund + rest;
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
