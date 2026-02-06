import { Injectable } from '@nestjs/common';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { TaskManagementService } from './task-management.service';
import { PlanModeService } from './plan-mode.service';
import { TaskStatus } from '../types/task.types';
import { PromptService } from '../../permissions/services/prompt.service';

@Injectable()
export class TaskToolsService {
  constructor(
    private taskService: TaskManagementService,
    private planModeService: PlanModeService,
    private promptService: PromptService,
  ) {}

  getTools() {
    return [
      this.createTaskCreateTool(),
      this.createTaskUpdateTool(),
      this.createTaskListTool(),
      this.createTaskGetTool(),
      this.createAskUserQuestionTool(),
      this.createEnterPlanModeTool(),
      this.createExitPlanModeTool(),
    ];
  }

  private createTaskCreateTool() {
    return tool(
      async ({ subject, description, activeForm, dependencies, metadata }) => {
        const task = this.taskService.createTask({
          subject,
          description,
          activeForm,
          dependencies: dependencies || [],
          metadata: metadata || {},
        });

        return JSON.stringify({
          success: true,
          taskId: task.id,
          task: {
            id: task.id,
            subject: task.subject,
            status: task.status,
          },
        });
      },
      {
        name: 'task_create',
        description:
          'Create a new task. Use this when breaking down complex work into trackable subtasks. The task will be shown to the user for approval.',
        schema: z.object({
          subject: z.string().describe('Brief task title (e.g., "Implement login endpoint")'),
          description: z
            .string()
            .describe('Detailed description of what needs to be done and why'),
          activeForm: z
            .string()
            .optional()
            .describe(
              'Present continuous form shown when in_progress (e.g., "Implementing login")',
            ),
          dependencies: z
            .array(z.string())
            .optional()
            .describe('Array of task IDs that must complete before this one'),
          metadata: z.record(z.any()).optional().describe('Additional metadata'),
        }),
      },
    );
  }

  private createTaskUpdateTool() {
    return tool(
      async ({ taskId, status, subject, description, activeForm, addDependencies, metadata }) => {
        const task = this.taskService.updateTask(taskId, {
          status: status as TaskStatus,
          subject,
          description,
          activeForm,
          addDependencies,
          metadata,
        });

        if (!task) {
          return JSON.stringify({ success: false, error: 'Task not found' });
        }

        return JSON.stringify({
          success: true,
          task: {
            id: task.id,
            subject: task.subject,
            status: task.status,
          },
        });
      },
      {
        name: 'task_update',
        description:
          'Update an existing task. Use to change status, modify details, or add dependencies.',
        schema: z.object({
          taskId: z.string().describe('ID of the task to update'),
          status: z
            .enum(['pending', 'in_progress', 'completed', 'failed', 'blocked', 'cancelled'])
            .optional()
            .describe('New status for the task'),
          subject: z.string().optional().describe('New subject'),
          description: z.string().optional().describe('New description'),
          activeForm: z.string().optional().describe('New active form'),
          addDependencies: z
            .array(z.string())
            .optional()
            .describe('Task IDs to add as dependencies'),
          metadata: z.record(z.any()).optional().describe('Metadata to merge'),
        }),
      },
    );
  }

  private createTaskListTool() {
    return tool(
      async () => {
        const tasks = this.taskService.listTasks();
        const pending = this.taskService.listPendingTasks();

        return JSON.stringify({
          total: tasks.length,
          pending: pending.length,
          tasks: tasks.map((t) => ({
            id: t.id,
            subject: t.subject,
            status: t.status,
            dependencies: t.dependencies,
            blocks: t.blocks,
          })),
        });
      },
      {
        name: 'task_list',
        description: 'List all tasks with their current status. Shows which tasks are ready to execute.',
        schema: z.object({}),
      },
    );
  }

  private createTaskGetTool() {
    return tool(
      async ({ taskId }) => {
        const task = this.taskService.getTask(taskId);

        if (!task) {
          return JSON.stringify({ success: false, error: 'Task not found' });
        }

        return JSON.stringify({
          success: true,
          task,
        });
      },
      {
        name: 'task_get',
        description: 'Get full details of a specific task including description and metadata.',
        schema: z.object({
          taskId: z.string().describe('ID of the task to retrieve'),
        }),
      },
    );
  }

  private createAskUserQuestionTool() {
    return tool(
      async ({ question, type, choices }) => {
        console.log('');

        if (type === 'confirm') {
          const answer = await this.promptService.confirm(question);
          return JSON.stringify({ answer });
        }

        if (type === 'choice' && choices) {
          const choiceObjects = choices.map((c, i) => ({
            key: String(i),
            label: c,
          }));

          const selectedKey = await this.promptService.choice(question, choiceObjects);
          const selectedIndex = parseInt(selectedKey);
          return JSON.stringify({ answer: choices[selectedIndex] });
        }

        if (type === 'text') {
          const answer = await this.promptService.question(question);
          return JSON.stringify({ answer });
        }

        return JSON.stringify({ error: 'Invalid question type' });
      },
      {
        name: 'ask_user_question',
        description:
          'Ask the user a question interactively. Use this when you need clarification, preferences, or decisions from the user before proceeding. This is better than guessing!',
        schema: z.object({
          question: z.string().describe('The question to ask the user'),
          type: z
            .enum(['confirm', 'choice', 'text'])
            .describe('Type of question: confirm (yes/no), choice (multiple options), or text (free form)'),
          choices: z
            .array(z.string())
            .optional()
            .describe('Array of choices for type=choice'),
        }),
      },
    );
  }

  private createEnterPlanModeTool() {
    return tool(
      async ({ title, description }) => {
        try {
          await this.planModeService.enterPlanMode(title, description);
          return JSON.stringify({
            success: true,
            message: 'Entered plan mode. Explore the codebase, design your approach, then use exit_plan_mode to present the plan for approval.',
          });
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: (error as Error).message,
          });
        }
      },
      {
        name: 'enter_plan_mode',
        description:
          'Enter planning mode for complex tasks. In plan mode, you should explore the codebase using read_file, glob, and grep to understand the architecture, then create a detailed plan. Use exit_plan_mode when ready to present the plan for user approval.',
        schema: z.object({
          title: z.string().describe('Title of the plan (e.g., "Implement user authentication")'),
          description: z
            .string()
            .describe('Brief description of what will be planned'),
        }),
      },
    );
  }

  private createExitPlanModeTool() {
    return tool(
      async ({ tasks }) => {
        try {
          const approved = await this.planModeService.exitPlanMode(
            tasks.map((t) => ({
              subject: t.subject,
              description: t.description,
              activeForm: t.activeForm,
              dependencies: t.dependencies,
            })),
          );

          return JSON.stringify({
            success: true,
            approved,
            message: approved
              ? 'Plan approved! You can now execute the tasks.'
              : 'Plan was not approved. Ask the user what they want to change.',
          });
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: (error as Error).message,
          });
        }
      },
      {
        name: 'exit_plan_mode',
        description:
          'Exit planning mode and present the plan for user approval. The user will see all tasks and can approve, modify, or cancel the plan.',
        schema: z.object({
          tasks: z
            .array(
              z.object({
                subject: z.string().describe('Task title'),
                description: z.string().describe('What this task does'),
                activeForm: z.string().optional().describe('Present continuous form'),
                dependencies: z
                  .array(z.string())
                  .optional()
                  .describe('Task IDs this depends on'),
              }),
            )
            .describe('Array of tasks that make up the plan'),
        }),
      },
    );
  }
}
