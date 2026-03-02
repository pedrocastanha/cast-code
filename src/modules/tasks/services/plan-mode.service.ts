import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { TaskManagementService } from './task-management.service';
import { PlanExecutorService } from './plan-executor.service';
import { PromptService } from '../../permissions/services/prompt.service';
import { CreateTaskOptions, TaskPlan } from '../types/task.types';
import { Colors } from '../../repl/utils/theme';

@Injectable()
export class PlanModeService {
  private inPlanMode = false;
  private currentPlan: TaskPlan | null = null;
  private planContext: Map<string, any> = new Map();

  constructor(
    private taskService: TaskManagementService,
    @Inject(forwardRef(() => PlanExecutorService))
    private planExecutor: PlanExecutorService,
    private promptService: PromptService,
  ) { }

  async enterPlanMode(title: string, description: string): Promise<void> {
    if (this.inPlanMode) {
      throw new Error('Already in plan mode');
    }

    if (this.taskService.getExecutionContext()) {
      throw new Error('Cannot enter plan mode while executing an approved plan');
    }

    this.inPlanMode = true;
    this.planContext.clear();
    this.planContext.set('title', title);
    this.planContext.set('description', description);

    console.log('');
    console.log(`${Colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Colors.reset}`);
    this.promptService.info(`${Colors.bold}📋 Entering PLAN MODE${Colors.reset}`);
    console.log(`${Colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Colors.reset}`);
    console.log('');
    console.log(`${Colors.bold}Planning:${Colors.reset} ${title}`);
    console.log(`${Colors.dim}${description}${Colors.reset}`);
    console.log('');
    this.promptService.info('I will explore the codebase and create an execution plan.');
    console.log('');
  }

  async exitPlanMode(tasks: CreateTaskOptions[]): Promise<{ approved: boolean; autoApprove: boolean; modification?: string }> {
    if (!this.inPlanMode) {
      throw new Error('Not in plan mode');
    }

    try {
      console.log('');
      console.log(`${Colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Colors.reset}`);
      this.promptService.info(`${Colors.bold}📋 Exiting PLAN MODE - Presenting Plan${Colors.reset}`);
      console.log(`${Colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${Colors.reset}`);
      console.log('');

      const planTitle = this.planContext.get('title') || 'Execution Plan';
      const planDescription = this.planContext.get('description') || '';

      const plan = this.taskService.createPlan(planTitle, planDescription, tasks);
      this.currentPlan = plan;

      const result = await this.taskService.approvePlan(plan.id);

      if (result.approved) {
        // Configurar contexto de execução
        this.taskService.setExecutionContext({
          planId: plan.id,
          autoApprove: result.autoApprove,
          currentTaskIndex: 0,
          startedAt: Date.now(),
        });

        // Executar plano usando PlanExecutorService
        await this.planExecutor.executePlan(plan.id, result.autoApprove);
      }

      return {
        approved: result.approved,
        autoApprove: result.autoApprove,
        modification: result.modificationRequested,
      };
    } finally {
      this.inPlanMode = false;
    }
  }

  isInPlanMode(): boolean {
    return this.inPlanMode;
  }

  setPlanContext(key: string, value: any): void {
    this.planContext.set(key, value);
  }

  getPlanContext(key: string): any {
    return this.planContext.get(key);
  }

  cancelPlanMode(): void {
    if (!this.inPlanMode) return;

    this.promptService.warn('Plan mode cancelled');
    this.inPlanMode = false;
    this.currentPlan = null;
    this.planContext.clear();
  }

  getCurrentPlan(): TaskPlan | null {
    return this.currentPlan;
  }
}
