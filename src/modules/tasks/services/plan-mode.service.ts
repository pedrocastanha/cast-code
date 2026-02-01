import { Injectable } from '@nestjs/common';
import { TaskManagementService } from './task-management.service';
import { PromptService } from '../../permissions/services/prompt.service';
import { CreateTaskOptions, TaskPlan } from '../types/task.types';

@Injectable()
export class PlanModeService {
  private inPlanMode = false;
  private currentPlan: TaskPlan | null = null;
  private planContext: Map<string, any> = new Map();

  constructor(
    private taskService: TaskManagementService,
    private promptService: PromptService,
  ) {}

  async enterPlanMode(title: string, description: string): Promise<void> {
    if (this.inPlanMode) {
      throw new Error('Already in plan mode');
    }

    this.inPlanMode = true;
    this.planContext.clear();

    console.log('');
    console.log('━'.repeat(60));
    this.promptService.info('📋 Entering PLAN MODE');
    console.log('━'.repeat(60));
    console.log('');
    console.log(`Planning: ${title}`);
    console.log(description);
    console.log('');
    this.promptService.info('I will ask you some questions and create an execution plan.');
    console.log('');
  }

  async exitPlanMode(tasks: CreateTaskOptions[]): Promise<boolean> {
    if (!this.inPlanMode) {
      throw new Error('Not in plan mode');
    }

    console.log('');
    console.log('━'.repeat(60));
    this.promptService.info('📋 Exiting PLAN MODE - Presenting Plan');
    console.log('━'.repeat(60));
    console.log('');

    const planTitle = this.planContext.get('title') || 'Execution Plan';
    const planDescription = this.planContext.get('description') || '';

    const plan = this.taskService.createPlan(planTitle, planDescription, tasks);
    this.currentPlan = plan;

    const approved = await this.taskService.approvePlan(plan.id);

    if (approved) {
      await this.taskService.executePlan(plan.id);
    }

    this.inPlanMode = false;
    return approved;
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
