import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Sse,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Observable, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { TaskManagementService } from '../../tasks/services/task-management.service';
import { TaskStatus } from '../../tasks/types/task.types';
import { getKanbanHtml } from '../views/kanban-ui';

export interface CreateTaskDto {
  subject: string;
  description: string;
}

export interface UpdateTaskDto {
  status?: string;
  description?: string;
  subject?: string;
}

@Controller('kanban')
export class KanbanController {
  constructor(private readonly taskService: TaskManagementService) {}

  @Get()
  getBoard(@Res() res: any): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(HttpStatus.OK).send(getKanbanHtml());
  }

  @Get('api/state')
  getState(): { tasks: any[]; plans: any[] } {
    const tasks = this.taskService.listTasks();
    const plans = Array.from(this.taskService.getPlans().values());
    return { tasks, plans };
  }

  @Sse('api/events')
  getEvents(): Observable<{ event: string; data: any }> {
    return interval(5000).pipe(
      map(() => ({
        event: 'ping',
        data: { timestamp: Date.now() },
      })),
    );
  }

  @Post('api/tasks')
  createTask(@Body() dto: CreateTaskDto) {
    if (!dto?.subject) {
      return { error: 'subject is required' };
    }
    const task = this.taskService.createTask({
      subject: dto.subject,
      description: dto.description || '',
    });
    return task;
  }

  @Patch('api/tasks/:id')
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    const task = this.taskService.getTask(id);
    if (!task) {
      return { error: 'Task not found' };
    }
    return this.taskService.updateTask(id, dto);
  }
}
