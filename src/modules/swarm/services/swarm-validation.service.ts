import { Injectable } from '@nestjs/common';
import type { SwarmPlan, SwarmRun, SwarmTaskPlan } from '../types';

@Injectable()
export class SwarmValidationService {
  validatePlan(plan: SwarmPlan): string[] {
    const errors: string[] = [];

    if (!plan.id?.trim()) errors.push('plan.id is required');
    if (!plan.goal?.trim()) errors.push('plan.goal is required');
    if (!plan.projectRoot?.trim()) errors.push('plan.projectRoot is required');
    if (!plan.workspaceRoot?.trim()) errors.push('plan.workspaceRoot is required');
    if (!plan.reasonForSwarm?.trim()) errors.push('plan.reasonForSwarm is required');
    if (!['draft', 'approved', 'rejected', 'superseded'].includes(plan.status)) {
      errors.push(`invalid plan.status: ${plan.status}`);
    }
    if (!['manual', 'apply_safe', 'apply_all'].includes(plan.integrationMode)) {
      errors.push(`invalid plan.integrationMode: ${plan.integrationMode}`);
    }
    if (!plan.runtimePolicy?.kind) errors.push('plan.runtimePolicy is required');
    if (!plan.globalConstraints?.maxWorkers || plan.globalConstraints.maxWorkers < 1) {
      errors.push('plan.globalConstraints.maxWorkers must be >= 1');
    }
    if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
      errors.push('plan.tasks must contain at least one task');
    }

    const taskIds = new Set<string>();
    for (const task of plan.tasks) {
      errors.push(...this.validateTask(task, taskIds));
    }

    for (const task of plan.tasks) {
      for (const dep of task.dependsOn) {
        if (!taskIds.has(dep)) {
          errors.push(`task ${task.id} depends on unknown task ${dep}`);
        }
      }
    }

    if (this.hasCyclicDependencies(plan.tasks)) {
      errors.push('plan.tasks contains cyclic dependencies');
    }

    return errors;
  }

  validateRun(run: SwarmRun): string[] {
    const errors: string[] = [];
    if (!run.id?.trim()) errors.push('run.id is required');
    if (!run.planId?.trim()) errors.push('run.planId is required');
    if (!run.projectRoot?.trim()) errors.push('run.projectRoot is required');
    if (!Array.isArray(run.tasks)) errors.push('run.tasks must be an array');
    return errors;
  }

  private validateTask(task: SwarmTaskPlan, taskIds: Set<string>): string[] {
    const errors: string[] = [];
    if (!task.id?.trim()) {
      errors.push('task.id is required');
      return errors;
    }
    if (taskIds.has(task.id)) {
      errors.push(`duplicate task id: ${task.id}`);
    }
    taskIds.add(task.id);

    if (!task.title?.trim()) errors.push(`task ${task.id}: title is required`);
    if (!task.worker?.id) errors.push(`task ${task.id}: worker is required`);
    if (!task.worker.systemPrompt?.trim()) errors.push(`task ${task.id}: worker.systemPrompt is required`);
    if (!Array.isArray(task.fileOwnership) || task.fileOwnership.length === 0) {
      errors.push(`task ${task.id}: fileOwnership is required`);
    }
    if (!Array.isArray(task.allowedTools) || task.allowedTools.length === 0) {
      errors.push(`task ${task.id}: allowedTools is required`);
    }
    return errors;
  }

  private hasCyclicDependencies(tasks: SwarmTaskPlan[]): boolean {
    const graph = new Map(tasks.map((task) => [task.id, task.dependsOn]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string): boolean => {
      if (visited.has(id)) return false;
      if (visiting.has(id)) return true;
      visiting.add(id);
      for (const dep of graph.get(id) ?? []) {
        if (visit(dep)) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };

    for (const task of tasks) {
      if (visit(task.id)) return true;
    }
    return false;
  }
}
